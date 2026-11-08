# 珍字集覽

A community evidence wiki for characters and glyphs. Anyone can create a record with a source image and view the collection.

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
```

New records are paused by default. To enable local submissions, create `.dev.vars` in the project root containing:

```dotenv
NEW_RECORDS_PAUSED=0
LOCAL_RATE_LIMIT=true
```

Then start Wrangler on loopback:

```sh
bun run build
bunx wrangler dev --local --infer-origin-from-routes=false --ip 127.0.0.1
```

Open the loopback URL printed by Wrangler. The local D1 database is stored in Wrangler's local state. To run the checks:

```sh
bun run test
bun run check
bun run build
```

## New record pause

`POST /new` accepts submissions only when `NEW_RECORDS_PAUSED` is exactly `0`. The checked-in Worker configuration defaults to `1`; missing and all other values pause submissions. Configure the variable explicitly for each Worker environment. Paused same-origin requests return 503 before the limiter or request body is read; framework checks may reject cross-origin requests earlier. GET requests and other POST routes are unaffected by this pause.

Worker configuration changes roll out across locations over time. A pause cannot retract writes already in flight; allow for propagation and in-flight requests when responding to an incident. Coordinate configuration with deployments and rollbacks: [Wrangler deployments](https://developers.cloudflare.com/workers/wrangler/configuration/) can overwrite dashboard variables unless configured to retain them, and deploying the checked-in default pauses new records. Older Worker versions without this gate cannot enforce the pause. With JavaScript, the 503 leaves the draft in the form; without JavaScript the response cannot restore submitted fields, and browser Back behavior varies.

## Cloudflare configuration

The checked-in configuration targets the production D1 database. Provision a database and configure its binding before using a separate environment. The `CONTRIBUTION_RATE_LIMIT` binding targets 5 POST requests per IPv4 address or IPv6 /64 prefix per 60 seconds at each Cloudflare location; counters can overshoot. Configure that binding separately for every named environment; choose a namespace ID unique to the limiter within the account. Missing or unavailable bindings and missing client addresses return 503; exhausted limits return 429. Both checks happen before reading the request body. With JavaScript, a 429 or limiter-unavailable 503 keeps the form in place; without JavaScript the response cannot restore submitted fields, and browser Back behavior varies. An oversized request returns 413 and does not preserve the form in place.

Production requires requests to reach the Worker through Cloudflare, which supplies `CF-Connecting-IP` and request `cf` metadata. For same-zone Worker subrequests, `CF-Connecting-IP` reflects `x-real-ip`, which the calling Worker can modify ([Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)). Do not expose an alternate origin that accepts client-supplied forwarding headers or allow untrusted Workers to invoke this Worker as if they were end users. For local Wrangler development only, set `LOCAL_RATE_LIMIT=true` in a local `.dev.vars` file and bind Wrangler to loopback. Local requests must use a loopback URL and address, and share one limiter key. Never set this variable in a deployed environment or expose the local server to a network. Wrangler's local limiter is a development simulation.

The application uses IPv4 addresses and IPv6 /64 prefixes as limiter keys; IPv4-mapped IPv6 addresses return 503. It sends a SHA-256 digest of the key and does not store or log the IP. The digest is pseudonymous, not anonymous: IP addresses can be guessed. [Cloudflare's rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) maintains local, eventually consistent counters at each Cloudflare location. They are not a global quota or comprehensive abuse prevention; users sharing an IPv4 address or IPv6 /64 prefix share a limit.


## Glyph Atlas sign-in

Sign-in is optional. Configure `ATLAS_ISSUER`, `ATLAS_CLIENT_ID`, `ATLAS_CLIENT_SECRET` and `ATLAS_PUBLIC_ORIGIN` as worker secrets or bindings, and register the exact callback URL `<ATLAS_PUBLIC_ORIGIN>/auth/callback` with the provider. The public origin must match the request origin exactly and use HTTPS, except for loopback HTTP in local development. Apply all D1 migrations before enabling the feature. The issuer and discovery endpoints must use HTTPS; discovered endpoints must share the issuer's origin. The provider must support authorization code flow, PKCE S256, client secret basic authentication and RS256 ID tokens. A token's issued-at time must be within ten minutes. No credentials are included in this repository.

Sign-in requires an anonymous contributor session. Adding evidence creates one; otherwise, select “Sign in with Glyph Atlas” and then “Continue to Glyph Atlas”. Sign-in links the contributor to the verified issuer and subject. If that identity already exists, the anonymous person is mapped to the existing person; historical entry creator IDs stay unchanged. Signing out revokes the current session. Changing to another Glyph Atlas account requires signing out first.

The protocol follows [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html), [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html), and [RFC 7636: PKCE](https://www.rfc-editor.org/rfc/rfc7636).

## Visibility

Apply the D1 migrations before serving code that reads visibility. Drain old application instances before hiding entries, since older readers do not filter them. Hiding an entry cannot retract responses already in flight or content already loaded or cached by a client.

## Continuous integration

GitHub Actions runs `bun install --frozen-lockfile` and `bun run build` for pull requests and pushes to `main`.

## Limitations

This is a local prototype without moderation, editing or deletion. Pagination lists 20 records at a time. Provider availability and the permitted endpoint layout have not been verified against a live Glyph Atlas deployment. Discovery and keys are fetched on each sign-in; each provider request has a five-second deadline and a 128 KiB response limit. The provider controls the identity assertions it issues.

Sessions expire after 365 days. Clearing an anonymous cookie loses its link to future contributions. Simultaneous first submissions or sign-in preparations can create separate anonymous identities, with only one cookie retained by the browser. If concurrent preparations establish different session families, signing out of one family cannot revoke an in-flight callback bound to the other; avoid concurrent preparation tabs. Expired flows and revoked sessions are not cleaned up automatically. Attribution merges are stored as person mappings; a future contributor-facing view must resolve them. Rate limiting and storage retention need operational policy before public use.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Linked sources retain their own rights; permission to use them must be obtained from their rights holders.
