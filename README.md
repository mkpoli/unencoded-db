# 珍字集覽

A community evidence wiki for unencoded characters and unifiable variants. Anyone can create a record with a source URL and view the collection.

## Names

| Language | Name | Tagline |
| --- | --- | --- |
| English | Rare Character Compendium | A community evidence wiki for unencoded characters and unifiable variants |
| Japanese | 珍字集覧 | 未収録文字と包摂可能な異体字 |
| Simplified Chinese | 珍字集览 | 未编码文字与可统一的异体字 |
| Traditional Chinese | 珍字集覽 | 未編碼文字與可統合的異體字 |
| Korean | 진자집람 | 미등재 문자와 통합 가능한 이체자 |
| Vietnamese | Tuyển tập chữ quý | Chữ chưa mã hóa và dị thể có thể hợp nhất |


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

## Limitations

This is a local prototype, not ready for public operation. It has no moderation, abuse prevention, rate limiting, editing, deletion or contributor accounts. Pagination lists 20 records at a time.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Linked sources retain their own rights; permission to use them must be obtained from their rights holders.
