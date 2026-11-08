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

The Cloudflare configuration contains a placeholder D1 ID. Provision a database and configure its binding before using a separate environment.

## Visibility

Apply the D1 migrations before serving code that reads visibility. Drain old application instances before hiding entries, since older readers do not filter them. Hiding an entry cannot retract responses already in flight or content already loaded or cached by a client.

## Continuous integration

GitHub Actions runs `bun install --frozen-lockfile` and `bun run build` for pull requests and pushes to `main`.

## Limitations

This is a local prototype, not ready for public operation. It has no moderation, abuse prevention, rate limiting, editing, deletion or contributor accounts. Pagination lists 20 records at a time.

An anonymous contributor session expires 365 days after creation. Deleting its cookie or allowing it to expire ends the link to future contributions; existing attribution remains in the database. Expired and revoked sessions are not yet cleaned up, and there is no interface to revoke a session. Simultaneous submissions before a browser receives a new cookie can create separate contributor identities; only one cookie will remain in the browser.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Linked sources retain their own rights; permission to use them must be obtained from their rights holders.
