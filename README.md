# Rare Character Compendium

A community evidence wiki for characters and glyphs. Anyone can add a character and attach evidence, revise its text, view the revision history and report a public record. Moderators review reports, can dismiss individual reports, and can hide records; hidden records can be restored from a private queue.

A character holds text: script, IDS, description, tags and meanings. Evidence holds what was seen elsewhere: an image, a place and its citation. A character page lists its evidence, and each image is served only through that evidence at `/{locale}/entry/[id]/evidence/[evidence]/image`. Classifying the glyph is a later question.

## Names

| Language | Name | Tagline |
| --- | --- | --- |
| English | Rare Character Compendium | A community evidence wiki for characters and glyphs |
| Japanese | 珍字集覧 | 文字と字形の証拠を集めるコミュニティウィキ |
| Simplified Chinese | 珍字集览 | 收集文字与字形证据的社区维基 |
| Traditional Chinese | 珍字集覽 | 收集文字與字形證據的社群維基 |
| Korean | 진자집람 | 문자와 글리프의 증거를 모으는 커뮤니티 위키 |
| Vietnamese | Tuyển tập chữ quý | Wiki cộng đồng thu thập bằng chứng về chữ và glyph |

## Languages and URLs

The public interface is available in the same six languages as Glyph Atlas: English, Japanese, Simplified Chinese, Traditional Chinese, Korean and Vietnamese. Every page is prefixed with its locale:

| Locale | URL |
| --- | --- |
| English | `/en` |
| Japanese | `/ja` |
| Simplified Chinese | `/zh-Hans` |
| Traditional Chinese | `/zh-Hant` |
| Korean | `/ko` |
| Vietnamese | `/vi` |

For example, the collection is at `/ja` and a record at `/ja/entry/12`.

A request to `/` returns a 303 redirect to the negotiated locale, with English as the default. Negotiation reads `Accept-Language` in quality order: `ja`, `ko` and `vi` map to themselves; `zh-TW`, `zh-HK`, `zh-MO` and `zh-Hant` map to `zh-Hant`; other Chinese tags map to `zh-Hans`; every other tag falls back to English. No locale cookie is used, so the address always names the language.

Application links keep the active locale; the third-party notice is a static English file at `/third-party/README.md`. The navigation language switcher links to the same path and query string in each locale. The locale layout validates the prefix and rejects unknown or malformed segments with 404. Other paths under a valid locale render the localized error page. Creating a record redirects to its localized entry page, a report returns to it, and hiding or restoring one redirects to the queue in the same locale.

Translations live in `messages/{en,ja,zh-Hans,zh-Hant,ko,vi}.json`. Each catalogue contains only the keys the public pages use.

## Design

The interface uses the small design system in `src/lib/design/`, with tokens and control shapes aligned to Glyph Atlas. [DESIGN.md](DESIGN.md) lists the tokens, components and usage rules; pages add classes from the system rather than new colours.

## Local development

Install [Bun](https://bun.sh/), then run:

```sh
bun install
bun run db:local
bun run preview
```

`bun run preview` starts Wrangler in local mode. D1 and R2 state is stored under `.wrangler/state`. Local R2 needs no account or bucket creation; the `IMAGES` binding in `wrangler.jsonc` points at `unencoded-db-images`.

The bucket stays private. Image object keys are generated as `entries/<uuid>` and never appear in page data or HTML; the composer's files and drawings use prefixes of their own.

To run the checks:

```sh
bun run test
bun run check
bun run build
```

## Images

- Each evidence record can carry one image. The edit page can replace or remove it; a new character starts with one evidence image. Rows migrated from `0001` remain image-less.
- JPEG, PNG and WebP are accepted, identified by magic bytes. SVG, HTML, empty and unrecognised files are rejected.
- The maximum file size is 16 MiB.
- Bytes live in R2; content type and size live in D1.
- Images are not decoded or re-encoded. A corrupt file with a valid signature may fail to render in the browser.
- `POST` routes with an image field (`/{locale}/new`, `/{locale}/batch`, `/{locale}/entry/[id]`, `/{locale}/entry/[id]/edit`) accept up to 16 MiB plus form framing. Other POST routes keep the 512 KiB limit.
- Evidence image responses use the stored content type, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`, so hiding takes effect on the next request. Missing, hidden and invalid-locale images also return an uncached 404.
- The request body, the parsed file and the stripped image are held in Worker memory. Concurrent uploads share the 128 MB isolate limit.
- Images are stripped of common metadata on upload: JPEG EXIF, XMP, IPTC and comments before the image scan, PNG text, tIME and EXIF chunks, and WebP EXIF/XMP chunks. JPEG EXIF orientation is kept; ICC colour profiles and pixel content are stored as uploaded. Image metadata is not preserved for attribution, so record credit in the bibliographic fields.
- An X or Twitter post link drops its `a` and `s` share-tracking parameters. Pasting one into a new evidence form fetches the post through the FxTwitter API (`https://api.fxtwitter.com`), fills the place as `X`, the provider as the author's `@handle` with their profile link, and the title with the post text, and attaches the first photo to the image field. Photos are taken only from `pbs.twimg.com`; the reader can replace any filled field before saving.

## Character drawings

The homepage draws each record's IDS with [han-compose](https://github.com/mkpoli/han-compose), from the composer export Glyph Atlas publishes at `https://glyphatlas.org/atlas/composer/`. The export's files and the drawn paths are cached in the `IMAGES` bucket under `composer/` and `glyphs/`. A missing drawing is warmed after the response, and `/api/glyph?ids=…` answers one the page did not have. Only descriptions on visible records are drawn.

## Contribution rate limit

Creating a record is limited to five POST requests per IPv4 address or IPv6 /64 prefix per 60 seconds at each Cloudflare location. The `CONTRIBUTION_RATE_LIMIT` binding holds this limit; configure it separately for every named environment and choose a namespace ID unique to the limiter within the account. Counters are local to each location, eventually consistent and approximate: shared networks share a limit, and distributed clients can exceed it. This is not a global quota or a substitute for moderation.

The limiter runs before the request body is read on `POST /{locale}/new` and `POST /{locale}/batch`. The add-evidence and edit forms accept the larger image body without this limiter. An exhausted limit returns 429 with `Retry-After: 60`. A missing or unavailable binding, or a missing or malformed client address, returns 503. With JavaScript the form keeps its contents and shows a localized notice; without JavaScript the browser shows a localized error page and the submitted fields are not restored. Oversized requests return 413 after the limiter allows them and also do not preserve the form.

Production requests must reach the Worker through Cloudflare, which supplies `CF-Connecting-IP` and request `cf` metadata. For same-zone Worker subrequests, `CF-Connecting-IP` reflects `x-real-ip`, which the calling Worker can modify ([Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)). Do not expose an alternate origin that accepts client-supplied forwarding headers or allow untrusted Workers to invoke this Worker as end users.

The limiter key is the IPv4 address or the IPv6 /64 prefix; IPv4-mapped IPv6 addresses return 503. The Worker sends a SHA-256 digest and does not store or log the address. The digest is pseudonymous, not anonymous: addresses can be guessed. [Cloudflare's rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) keeps local, eventually consistent counters at each location.

For local Wrangler development only, set `LOCAL_RATE_LIMIT=true` in `.dev.vars` and bind Wrangler to loopback. Local requests must use a loopback URL and address and share one limiter key. Never set this variable in a deployed environment or expose the local server to a network. Wrangler's local limiter is a development simulation.

## Glyph Atlas sign-in

Sign-in is optional. Configure `ATLAS_ISSUER`, `ATLAS_CLIENT_ID`, `ATLAS_CLIENT_SECRET` and `ATLAS_PUBLIC_ORIGIN` as worker secrets or bindings, and register the exact callback URL `<ATLAS_PUBLIC_ORIGIN>/auth/callback` with the provider. The public origin must match the request origin exactly and use HTTPS, except for loopback HTTP in local development. Apply all D1 migrations before enabling the feature. The issuer and discovery endpoints must use HTTPS; discovered endpoints must share the issuer's origin. The provider must support authorization code flow, PKCE S256, client secret basic authentication and RS256 ID tokens. A token's issued-at time must be within ten minutes. No credentials are included in this repository.

Sign-in requires an anonymous contributor session. Adding evidence creates one; otherwise, select “Log in / Register”. Sign-in links the contributor to the verified issuer and subject. If that identity already exists, the anonymous person is mapped to the existing person; historical entry creator IDs stay unchanged. Signing out revokes the current session. Changing to another Glyph Atlas account requires signing out first.

With the `profile` scope, the account name and picture come from the userinfo endpoint and appear in the header. The account menu links to the profile on Glyph Atlas.

The protocol follows [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html), [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html), and [RFC 7636: PKCE](https://www.rfc-editor.org/rfc/rfc7636).

## Moderation setup

Moderation development needs synthetic bindings for `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `MODERATOR_EMAILS`, plus an Access assertion from that team. The Worker verifies the assertion in every environment. Do not weaken HTTPS or add a development admin bypass.

Moderation is a private area at `/{locale}/moderate` in every interface locale. Cloudflare Access controls who can reach it, and the Worker verifies the Access assertion independently. A request is accepted only when all of these hold:

- `ACCESS_TEAM_DOMAIN` is the team hostname in lowercase, with no scheme or path, such as `example.cloudflareaccess.com`.
- `ACCESS_AUD` is the AUD tag of the Access application.
- The `Cf-Access-Jwt-Assertion` token is RS256-signed by the team, unexpired, issued for the configured audience, and includes its issuer, subject, audience, expiry, issued-at and email claims.
- The token email is in `MODERATOR_EMAILS`, a comma-separated allowlist of at most 20 addresses. Matching ignores case.

Missing configuration, a failed JWKS fetch, a malformed or expired token and an unlisted email all fail closed: the moderation area returns an empty 404 for every method, whether or not a route exists there. SvelteKit redirects a trailing slash before the guard runs, so `/ja/moderate/` receives a redirect to `/ja/moderate`. The JWKS document is fetched from `https://<team>/cdn-cgi/access/certs` with redirects rejected, a five-second deadline, a 128 KiB body cap and a ten-minute cache. Failed fetches are retried after 30 seconds.

To set up Access:

1. Create a Cloudflare Access application for the moderation paths in each interface locale, such as `/en/moderate*` and `/ja/moderate*`, and allow the moderator emails.
2. Copy the application's AUD tag to `ACCESS_AUD`.
3. Set `ACCESS_TEAM_DOMAIN` to the team hostname.
4. Set `MODERATOR_EMAILS` to the same emails.
5. Apply the same protection to every hostname that reaches the Worker, including `workers.dev` and preview hostnames.

Access and the Worker configuration must both cover every reachable hostname. An unprotected hostname bypasses the Access layer; the Worker still enforces its own check, but the deployment no longer has two independent controls.

Adding these variables and deploying the Worker does not create or update an Access application. Access adds the assertion to the paths its application covers. Cover the record pages as well when moderators should hide records from there.

## Visibility and moderation

Hidden entries are absent from the listing, the entry page and the image route. Hiding is not deletion or redaction: the record remains in the database, can be restored, and responses already in flight, cached by a client or held by a proxy can still contain it. Hidden entries are listed only in the private queue, newest first, 20 at a time. Hidden records return 404 on the edit and history pages.

Every hide and restore writes one `moderation_audit` row with the entry id, action, moderator email and UTC time. That insert performs the visibility change inside a trigger, so the audit row and the transition roll back together on failure. Audit rows are append-only and contain no entry content. A visibility change also advances the edit generation, so a form opened before it returns 409. Moderated pages are sent with frame protection and a private, no-store cache policy. The Worker changes visibility only through the audit insert; a database writer with schema access can still change visibility directly, so restrict database access.

Apply the D1 migrations before deploying the Worker. Locally:

```sh
bun run db:local
```

Against a remote database:

```sh
bunx wrangler d1 migrations apply DB --remote
```

Drain old application instances before hiding entries, since older readers do not filter them, and before applying `0006`, since it removes the old URL column that older writers still use. Drain writers that do not advance revisions before applying `0007`, since their updates fail once the revision triggers exist.

## Revisions

Editing a character submits its character text and advances the entry revision by one. Editing the entry's first evidence also updates the mirrored source columns and advances the revision; later evidence edits change only that evidence record. `entry_revisions` stores every version of the character and first-evidence text; the history page lists 20 at a time, newest first. A redacted snapshot shows only its revision number, recording date and a redaction marker. Images, tags, meanings and related characters are not versioned: the current ones belong to every revision.

Each edit form carries the revision and visibility generation it was opened at. A write succeeds only when both still match, so a form opened before another edit or a visibility change returns 409 rather than overwriting. Migration `0007_revisions.sql` backfills the current text of every record and installs triggers that require the next revision and reject changes to stored revisions. Migration `0008_edit_generation.sql` adds the generation that invalidates forms opened before a visibility change. Pause submissions, drain older writers and rehearse both migrations against a representative database before applying them; production-scale time and storage have not been measured.

## Reporting

A public entry page has a “Report this record” form. A report carries a reason (Spam, Privacy, Copyright, Other) and an optional note of up to 2000 characters; the note is trimmed. The form posts without JavaScript to `POST /{locale}/entry/[id]/report` and returns to the record with a confirmation. A report does not prove a rights claim: moderators review it and decide whether to hide the entry.

Reports store no reporter identity. The database keeps the entry id, reason, note, creation time and resolution time. The rate limiter hashes the client network in memory and stores neither the address nor the digest, and the Worker does not log it. Notes are untrusted text, visible to moderators in the private queue at `/{locale}/moderate/reports`, and escaped when rendered. A hidden or missing entry cannot receive reports.

Moderators can dismiss one open report from the private queue without hiding its entry. A dismissal stores the report id, moderator email and UTC time, then resolves that report in the same database statement; the entry and its other open reports are unchanged. Dismissal rows are append-only and contain no report content.

Hiding an entry resolves every remaining open report in the same database statement as the visibility change, with `resolved_at` copied from the audit time. Restoring the entry leaves dismissed and otherwise resolved reports resolved. An entry can hold at most 100 open reports; further reports return 429 until reports are resolved. The cap bounds storage per entry, but it does not stop a network from filling the newest queue page with spam, so moderation coverage remains an operational requirement. Notes are capped at 2000 characters. Resolved reports and dismissal rows are not pruned automatically.

## Report rate limit

`POST /{locale}/entry/[id]/report` allows five requests per 60 seconds per client network through the `REPORT_RATE_LIMIT` binding. The check runs in `hooks.server.ts` before the request body is read or parsed. A rejected request receives 429 with `retry-after: 60`; an unavailable limiter returns 503. GET requests and other POST paths are unaffected.

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

Not deployed yet. Apply all migrations before running it.

## Deployment

Provision the remote bucket before deploying:

```sh
bunx wrangler r2 bucket create unencoded-db-images
```

Apply all migrations before deploying code that expects visibility, revisions and the image schema:

```sh
bunx wrangler d1 migrations apply DB --remote
```

Migration `0001` creates the base table. Migration `0002` adds `visible` and the `entries_visible_id` index. Migration `0003` adds related comparisons. Migration `0004` adds anonymous attribution. Migration `0005` adds OIDC identities and session rotation. Migration `0006` rebuilds `entries`, preserves `visible`, comparisons, attribution and the id high-water mark, recreates `entries_visible_id`, adds a unique partial `entries_image_key` index, removes the source URL column and adds `image_key`, `image_type` and `image_size`. Migration `0007` adds the `revision` column and `entry_revisions` with the backfill, snapshot and immutability triggers. Migration `0008` adds `edit_generation` and advances it on every visibility change. Migration `0009` adds the tombstone flag and redaction audit table, restates the snapshot triggers for the new column, and rejects any update that is not one complete scrub of a noncurrent snapshot. Migration `0010` adds the moderation audit table and its triggers, and the `entries_hidden_id` index behind the queue. Migration `0011` adds anonymous entry reports, the open and entry indexes, and the triggers that refuse reports for hidden entries, cap open reports at 100 and resolve them on hide. Existing rows keep their ids and text fields; existing source URLs are dropped.

The Cloudflare configuration names the production D1 database and an R2 bucket. Configure real bindings for a separate environment, including `CONTRIBUTION_RATE_LIMIT` and `REPORT_RATE_LIMIT` for each deployed environment.

## Storage gaps

There is no global storage quota, no per-user quota and no cleanup job. An R2 put that times out after the request finishes can leave an orphan object. If the insert returns no row without an error, the object is deleted on a best-effort basis. A thrown insert error is treated as ambiguous: the Worker looks for the row and otherwise keeps the object, which can leave an orphan. Recovering other orphans requires an operator.

## Rights

Uploaders must have the rights to share the image. Image metadata is stripped, so credit belongs in the record's title, author and publisher fields. Uploaded images keep their original rights; the project license covers the code only.

A validation failure returns the form with its errors; an upload over the request limit returns 413. The browser clears the file input, so the image must be selected again. Text fields are preserved on validation errors. The request limit is 16 MiB plus framing on the routes with an image field.

## JSON export

`GET /export.json` returns visible records in ascending id order with `version: 2`. Read `next` and request `?after=<next>` until it is null. Pages default to 100 records; `limit` accepts 1 to 200. Hidden records are excluded and responses are not cached.

```sh
curl 'https://example.org/export.json?limit=200'
curl 'https://example.org/export.json?limit=200&after=200'
```

Each record contains its id, script, IDS, description, creation time, comparisons and an `evidence` array. Evidence carries the source fields, date precision and whether an image exists.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`. Add repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1 and R2 edit) and `CLOUDFLARE_ACCOUNT_ID`. The workflow runs tests, the type check, the build, D1 migrations and `wrangler deploy`.

## Continuous integration

GitHub Actions runs `bun install --frozen-lockfile` and `bun run build` for pull requests and pushes to `main`.

## Limitations

This is a local prototype, not ready for public operation. It has no deletion. Hiding and restoring records and report dismissals are audited, but the audit keeps no entry content. Editing is anonymous and has no rate limit; creating a record and report submissions are limited per client network as described above. The collection page lists 20 records at a time; export pages use the cursor described above. Reporting and moderation are not deployed.

Provider availability and the permitted endpoint layout have not been verified against a live Glyph Atlas deployment. Discovery and keys are fetched on each sign-in; each provider request has a five-second deadline and a 128 KiB response limit. The provider controls the identity assertions it issues.

Sessions expire after 365 days. Clearing an anonymous cookie loses its link to future contributions. Simultaneous first submissions or sign-in preparations can create separate anonymous identities, with only one cookie retained by the browser. If concurrent preparations establish different session families, signing out of one family cannot revoke an in-flight callback bound to the other; avoid concurrent preparation tabs. Expired flows and revoked sessions are not cleaned up automatically. Attribution merges are stored as person mappings; a future contributor-facing view must resolve them. Storage retention and abuse response need operational policy before public use.

**Public launch is blocked:** handling sensitive current content has no operational policy yet. An internal primitive can irreversibly redact noncurrent snapshots, with an audit record; it has no public interface. Current records and other revisions may still contain the same text. Redaction cannot retract copies in caches, logs, database backups or point-in-time recovery. Hiding an entry conceals its history, and restoring it republishes its unredacted snapshots. Apply the redaction migration before deploying readers or writers that use it.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md).
