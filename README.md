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

## Limitations

This is a local prototype, not ready for public operation. It has no moderation, abuse prevention, rate limiting, editing, deletion or contributor accounts. Pagination lists 20 records at a time.

An anonymous contributor session expires 365 days after creation. Deleting its cookie or allowing it to expire ends the link to future contributions; existing attribution remains in the database. Expired and revoked sessions are not yet cleaned up, and there is no interface to revoke a session. Simultaneous submissions before a browser receives a new cookie can create separate contributor identities; only one cookie will remain in the browser.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Linked sources retain their own rights; permission to use them must be obtained from their rights holders.
