# 珍字集覽

A community evidence wiki for characters and glyphs. Anyone can create a record with a source image and view the collection, and report a public record. Moderators review reports and can hide records; hidden records can be restored from a private queue.

A record keeps a character or glyph as a person encountered it, with a source image and optional IDS. The collection gathers them in one place for discovering and sharing new characters, and keeps the evidence for analysis and IRG suggestions.

## Names

| Language | Name | Tagline |
| --- | --- | --- |
| English | Rare Character Compendium | A community evidence wiki for characters and glyphs |
| Japanese | 珍字集覧 | 文字と字形の証拠を集めるコミュニティウィキ |
| Simplified Chinese | 珍字集览 | 收集文字与字形证据的社区维基 |
| Traditional Chinese | 珍字集覽 | 收集文字與字形證據的社群維基 |
| Korean | 진자집람 | 문자와 글리프의 증거를 모으는 커뮤니티 위키 |
| Vietnamese | Tuyển tập chữ quý | Wiki cộng đồng thu thập bằng chứng về chữ và glyph |

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

## Glyph Atlas sign-in

Sign-in is optional. Configure `ATLAS_ISSUER`, `ATLAS_CLIENT_ID`, `ATLAS_CLIENT_SECRET` and `ATLAS_PUBLIC_ORIGIN` as worker secrets or bindings, and register the exact callback URL `<ATLAS_PUBLIC_ORIGIN>/auth/callback` with the provider. The public origin must match the request origin exactly and use HTTPS, except for loopback HTTP in local development. Apply all D1 migrations before enabling the feature. The issuer and discovery endpoints must use HTTPS; discovered endpoints must share the issuer's origin. The provider must support authorization code flow, PKCE S256, client secret basic authentication and RS256 ID tokens. A token's issued-at time must be within ten minutes. No credentials are included in this repository.

Sign-in requires an anonymous contributor session. Adding evidence creates one; otherwise, select “Sign in with Glyph Atlas” and then “Continue to Glyph Atlas”. Sign-in links the contributor to the verified issuer and subject. If that identity already exists, the anonymous person is mapped to the existing person; historical entry creator IDs stay unchanged. Signing out revokes the current session. Changing to another Glyph Atlas account requires signing out first.

The protocol follows [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html), [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html), and [RFC 7636: PKCE](https://www.rfc-editor.org/rfc/rfc7636).

## Moderation setup

Moderation development needs synthetic bindings for `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `MODERATOR_EMAILS`, plus an Access assertion from that team. The Worker verifies the assertion in every environment. Do not weaken HTTPS or add a development admin bypass.

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

## Reporting

A public entry page has a "Report this record" form. A report carries a reason (Spam, Privacy, Copyright, Other) and an optional note of up to 2000 characters; the note is trimmed. The form posts without JavaScript. A report does not prove a rights claim: moderators review it and decide whether to hide the entry.

Reports store no reporter identity. The database keeps the entry id, reason, note, creation time and resolution time. The rate limiter hashes the client network in memory and stores neither the address nor the digest, and the Worker does not log it. Notes are untrusted text, visible to moderators in the private queue, and escaped when rendered. A hidden or missing entry cannot receive reports.

Hiding an entry resolves its open reports in the same database statement as the visibility change, with `resolved_at` copied from the audit time. Restoring the entry leaves them resolved. An entry can hold at most 100 open reports; further reports return 429 until the entry is hidden, which resolves them. The cap bounds storage per entry, but it does not stop a network from filling the newest queue page with spam, so moderation coverage remains an operational requirement. Notes are capped at 2000 characters, and nothing prunes resolved rows automatically.

## Report rate limit

`POST /entry/[id]/report` allows five requests per 60 seconds per client network through the `REPORT_RATE_LIMIT` binding. The check runs in `hooks.server.ts` before the request body is read or parsed. A rejected request receives 429 with `retry-after: 60`; an unavailable limiter returns 503. GET requests and other POST paths are unaffected.

The key is SHA-256 of the client address, or of the IPv6 /64 prefix. IPv4-mapped IPv6 and malformed addresses fail closed. The address is not stored or logged, and only the hash reaches the binding.

Configuration in `wrangler.jsonc`:

```jsonc
"ratelimits": [
  { "name": "REPORT_RATE_LIMIT", "namespace_id": "1002", "simple": { "limit": 5, "period": 60 } }
]
```

`namespace_id` must not match any other rate limiter in the account.

Cloudflare rate limit counters are approximate and local to each Cloudflare location, so the effective global limit is higher than five per minute. IPv6 clients share one bucket across the whole /64, which affects networks that assign many addresses from one prefix. `getClientAddress()` reads the edge-provided client address; another Worker in the same zone can pass a forged address, so the key is reliable only for traffic that reaches this Worker through Cloudflare's edge. Cover alternate paths with Access or WAF.

Local simulation: put `LOCAL_RATE_LIMIT=true` in `.dev.vars` (gitignored). The Worker then keeps one in-process bucket of five requests per 60 seconds, and only when the request host is loopback and the client address is `127.0.0.1` or `::1`; every other request fails closed with 503. Requests through a deployed hostname do not match the loopback condition.

This feature is not deployed. Apply all migrations before running it.

## Continuous integration

GitHub Actions runs `bun install --frozen-lockfile` and `bun run build` for pull requests and pushes to `main`.

## Limitations

This is a local prototype, not ready for public operation. It has no editing, deletion or record-creation rate limit; report submissions are limited as described above. Pagination lists 20 records at a time. The audit records hide and restore actions; it does not keep entry revisions or redacted content. Reporting and moderation are not deployed.

Provider availability and the permitted endpoint layout have not been verified against a live Glyph Atlas deployment. Discovery and keys are fetched on each sign-in; each provider request has a five-second deadline and a 128 KiB response limit. The provider controls the identity assertions it issues. Sessions expire after 365 days. Clearing an anonymous cookie loses its link to future contributions. Simultaneous first submissions or sign-in preparations can create separate anonymous identities, with only one cookie retained by the browser. If concurrent preparations establish different session families, signing out of one family cannot revoke an in-flight callback bound to the other; avoid concurrent preparation tabs. Expired flows and revoked sessions are not cleaned up automatically. Attribution merges are stored as person mappings; a future contributor-facing view must resolve them. Record-creation rate limiting and storage retention need operational policy before public use.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Linked sources retain their own rights; permission to use them must be obtained from their rights holders.
