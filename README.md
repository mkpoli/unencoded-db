# 珍字集覽

A collection of evidence for unencoded characters and unifiable variants. Anyone can create a record with a source URL and view the collection.

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

## Visibility rollout

Apply the D1 migrations before serving code that reads visibility. Drain old application instances before hiding entries, since older readers do not filter them. Hiding an entry cannot retract responses already in flight or content already loaded or cached by a client.

## JSON export

`GET /export.json` returns visible records in ascending id order with `version: 1`. Read `next` and request `?after=<next>` until it is null. Pages default to 100 records; `limit` accepts 1 to 200. Hidden records are excluded and responses are not cached.

```sh
curl 'https://example.org/export.json?limit=200'
curl 'https://example.org/export.json?limit=200&after=200'
```

Each record contains its id, script, IDS, description, place, source URL, title, author, publisher, year, page, note and creation time. Images and related-character comparisons are not included.

## Limitations

This is a local prototype, not ready for public operation. It has no moderation, abuse prevention, rate limiting, editing, deletion or contributor accounts. Pagination lists 20 records at a time.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Linked sources retain their own rights; permission to use them must be obtained from their rights holders.
