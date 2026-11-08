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
bun run preview
```

The local D1 database is stored in Wrangler's local state. To run the checks:

```sh
bun run test
bun run check
bun run build
```

The Cloudflare configuration contains a placeholder D1 ID. Provision a database and configure its binding before using a separate environment. The `CONTRIBUTION_RATE_LIMIT` binding targets 5 POST requests per IPv4 address or IPv6 /64 prefix per 60 seconds at each Cloudflare location; counters can overshoot. Configure that binding separately for every named environment; choose a namespace ID unique to the limiter within the account. Missing or unavailable bindings and missing client addresses return 503; exhausted limits return 429. Both checks happen before reading the request body. With JavaScript, a 429 or limiter-unavailable 503 keeps the form in place; without JavaScript the response cannot restore submitted fields, and browser Back behavior varies. An oversized request returns 413 and does not preserve the form in place.

Production requires requests to reach the Worker through Cloudflare, which supplies `CF-Connecting-IP` and request `cf` metadata. For same-zone Worker subrequests, `CF-Connecting-IP` reflects `x-real-ip`, which the calling Worker can modify ([Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)). Do not expose an alternate origin that accepts client-supplied forwarding headers or allow untrusted Workers to invoke this Worker as if they were end users. For local Wrangler development only, set `LOCAL_RATE_LIMIT=true` in a local `.dev.vars` file and bind Wrangler to loopback. Local requests must use a loopback URL and address, and share one limiter key. Never set this variable in a deployed environment or expose the local server to a network. Wrangler's local limiter is a development simulation.

The application uses IPv4 addresses and IPv6 /64 prefixes as limiter keys; IPv4-mapped IPv6 addresses return 503. It sends a SHA-256 digest of the key and does not store or log the IP. The digest is pseudonymous, not anonymous: IP addresses can be guessed. [Cloudflare's rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) maintains local, eventually consistent counters at each Cloudflare location. They are not a global quota or comprehensive abuse prevention; users sharing an IPv4 address or IPv6 /64 prefix share a limit.

## Visibility

Apply the D1 migrations before serving code that reads visibility. Drain old application instances before hiding entries, since older readers do not filter them. Hiding an entry cannot retract responses already in flight or content already loaded or cached by a client.

## Continuous integration

GitHub Actions runs `bun install --frozen-lockfile` and `bun run build` for pull requests and pushes to `main`.

## Limitations

This is a local prototype, not ready for public operation. It has no moderation, editing, deletion or contributor accounts. Pagination lists 20 records at a time.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Linked sources retain their own rights; permission to use them must be obtained from their rights holders.
