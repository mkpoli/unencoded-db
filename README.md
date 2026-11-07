# 珍字集覽

A collection of evidence for unencoded characters and unifiable variants. Anyone can create or revise a record with a source URL and view its revision history.

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

## Revision rollout

The revision migration copies existing records in one statement; its time and storage costs grow with the database. Pause submissions and drain older writers before migrating, and rehearse the migration against a representative copy. Evidence updates that omit the revision step fail after migration. Drain editors that do not check the visibility generation before changing visibility; they can otherwise submit forms opened before a hide and restore.

## Limitations

This is a local prototype, not ready for public operation. It has no moderation, abuse prevention, rate limiting, deletion or contributor accounts. Pagination lists 20 records at a time.

**Public launch is blocked:** moderator authorization and handling sensitive current content are required. An internal primitive can irreversibly redact noncurrent snapshots, with an audit record; it has no public interface. Current records and other revisions may still contain the same text. Redaction cannot retract copies in caches, logs or backups. Hiding an entry conceals its history, and restoring it republishes its unredacted snapshots. Apply the redaction migration before deploying readers or writers that use it.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Linked sources retain their own rights; permission to use them must be obtained from their rights holders.
