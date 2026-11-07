# 珍字集覽

A collection of evidence for unencoded characters and unifiable variants. Anyone can create a record with a source URL or image and view the collection.

## Local development

Install [Bun](https://bun.sh/), then run:

```sh
bun install
bun run db:local
bun run preview
```

The local D1 database and R2 bucket are stored in Wrangler's local state. To run the checks:

```sh
bun run test
bun run check
bun run build
```

The Cloudflare configuration contains a placeholder D1 ID. Provision a database and bucket and configure their bindings before using a separate environment.

## Limitations

This is a local prototype, not ready for public operation. It has no moderation, abuse prevention, rate limiting, editing, deletion or contributor accounts. Uploads are public; only upload material you have permission to share. JPEG, PNG and WebP uploads are limited to 15 MiB; files with EXIF, XMP or text metadata and animated PNG or WebP are rejected. Structural validation does not guarantee that an image can be decoded. Failed database writes can leave unreferenced objects in the bucket. Back up and manage the database and object store together. Pagination lists 20 records at a time.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md). Uploaded material and linked sources retain their own rights; permission to use them must be obtained from their rights holders.
