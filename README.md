# 珍字集覽

A collection of evidence for unencoded characters and unifiable variants. Anyone can create a record with a source URL and view the collection. Moderators can hide records and restore them from a private queue.

## Local development

Install [Bun](https://bun.sh/), then run:

```sh
bun install
bun run db:local
bun run preview
```

The local D1 database is stored in Wrangler's local state. To run the checks:

```sh
bun run test
bun run check
bun run build
```

The Cloudflare configuration contains a placeholder D1 ID. Provision a database and configure its binding before using a separate environment.

Moderation development needs synthetic bindings for `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `MODERATOR_EMAILS`, plus an Access assertion from that team. The Worker verifies the assertion in every environment. Do not weaken HTTPS or add a development admin bypass.

## Moderation setup

Moderation is a private area at `/moderate`. Cloudflare Access controls who can reach it, and the Worker verifies the Access assertion independently. A request is accepted only when all of these hold:

- `ACCESS_TEAM_DOMAIN` is the team hostname in lowercase, with no scheme or path, such as `example.cloudflareaccess.com`.
- `ACCESS_AUD` is the AUD tag of the Access application.
- The `Cf-Access-Jwt-Assertion` token is RS256-signed by the team, unexpired, issued for the configured audience, and includes its issuer, subject, audience, expiry, issued-at and email claims.
- The token email is in `MODERATOR_EMAILS`, a comma-separated allowlist of at most 20 addresses. Matching ignores case.

Missing configuration, a failed JWKS fetch, a malformed or expired token and an unlisted email all fail closed: the moderation area returns an empty 404 for every method, whether or not a route exists there. SvelteKit redirects a trailing slash before the guard runs, so `/moderate/` receives a redirect to `/moderate`. The JWKS document is fetched from `https://<team>/cdn-cgi/access/certs` with redirects rejected, a five-second deadline, a 128 KiB body cap and a ten-minute cache. Failed fetches are retried after 30 seconds.

To set up Access:

1. Create a Cloudflare Access application for the hostname path `/moderate*` and allow the moderator emails.
2. Copy the application's AUD tag to `ACCESS_AUD`.
3. Set `ACCESS_TEAM_DOMAIN` to the team hostname.
4. Set `MODERATOR_EMAILS` to the same emails.
5. Apply the same protection to every hostname that reaches the Worker, including `workers.dev` and preview hostnames.

Access and the Worker configuration must both cover every reachable hostname. An unprotected hostname bypasses the Access layer; the Worker still enforces its own check, but the deployment no longer has two independent controls.

Adding these variables and deploying the Worker does not create or update an Access application. Access adds the assertion to the paths its application covers. Cover the entry pages as well when moderators should hide records from there.

## Visibility and moderation

Hidden entries return 404 on public pages. Hiding is not deletion or redaction: the record remains in the database, can be restored, and responses already in flight, cached by a client or held by a proxy can still contain it. Hidden entries are listed only in the private queue, newest first, 20 at a time.

Every hide and restore writes one `moderation_audit` row with the entry id, action, moderator email and UTC time. That insert performs the visibility change inside a trigger, so the audit row and the transition roll back together on failure. Audit rows are append-only and contain no entry content. Moderated pages are sent with frame protection and a private, no-store cache policy. The Worker changes visibility only through the audit insert; a database writer with schema access can still change visibility directly, so restrict database access.

Apply the D1 migrations before deploying the Worker. Locally:

```sh
bun run db:local
```

Against a remote database:

```sh
bunx wrangler d1 migrations apply DB --remote
```

Drain old application instances before hiding entries, since older readers do not filter them.

## Limitations

This is a local prototype, not ready for public operation. It has no editing, deletion, rate limiting, abuse prevention or contributor accounts. Pagination lists 20 records at a time. The audit records hide and restore actions; it does not keep entry revisions or redacted content.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Linked sources retain their own rights; permission to use them must be obtained from their rights holders.
