# 珍字集覽

A community evidence wiki for characters and glyphs. Anyone can add a record with a source image and view the collection.

A record keeps one source image as its evidence: a photo, scan or screenshot of the character or glyph. The image is served only through its record at `/entry/[id]/image`. Whether the glyph is encoded, a variant or new is a later question.

## Local development

Install [Bun](https://bun.sh/), then run:

```sh
bun install
bun run db:local
bun run preview
```

`bun run preview` starts Wrangler in local mode. D1 and R2 state is stored under `.wrangler/state`. Local R2 needs no account or bucket creation; the `IMAGES` binding in `wrangler.jsonc` points at `unencoded-db-images`.

The bucket stays private. Object keys are generated as `entries/<uuid>` and never appear in page data or HTML.

To run the checks:

```sh
bun run test
bun run check
bun run build
```

## Images

- One image per record. There is no editing or replacement flow.
- JPEG, PNG and WebP are accepted, identified by magic bytes. SVG, HTML, empty and unrecognised files are rejected.
- The maximum file size is 8 MiB.
- Bytes live in R2; content type and size live in D1.
- Images are not decoded or re-encoded. A corrupt file with a valid signature may fail to render in the browser.
- `POST /new` accepts up to 8 MiB plus form framing. Other POST routes keep the 128 KiB limit.
- Image responses use the stored content type, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`, so hiding takes effect on the next request.
- Images are stripped of common metadata on upload: JPEG APP1/APP13 segments and comments, PNG text and EXIF chunks, and WebP EXIF/XMP chunks. Other metadata and pixel content are stored as uploaded.

## Visibility

Hidden entries are absent from the listing, the entry page and the image route. Apply migrations `0001` to `0003` before serving code that filters visibility. Drain old application instances before hiding entries, since older readers do not filter them, and before applying `0003`, since it removes the source URL column that older writers still use. Hiding an entry cannot retract responses already in flight or content already loaded by a client.

## Deployment

Provision the remote bucket before deploying:

```sh
bunx wrangler r2 bucket create unencoded-db-images
```

Apply all migrations before deploying code that expects visibility and the image schema:

```sh
bunx wrangler d1 migrations apply DB --remote
```

Migration `0001` creates the base table. Migration `0002` adds `visible` and the `entries_visible_id` index. Migration `0003` rebuilds `entries`, preserves `visible` and the id high-water mark, recreates `entries_visible_id`, removes the source URL column and adds `image_key`, `image_type` and `image_size`. Existing rows keep their ids and text fields; existing source URLs are dropped.

The Cloudflare configuration contains a placeholder D1 database ID and an R2 bucket name. Configure real bindings for a separate environment.

## Storage gaps

There is no global storage quota, no per-user quota and no cleanup job. An R2 put that times out after the request finishes can leave an orphan object. If the insert returns no row without an error, the object is deleted on a best-effort basis. A thrown insert error is treated as ambiguous: the Worker looks for the row and otherwise keeps the object, which can leave an orphan. Recovering other orphans requires an operator.

## Rights

Uploaders must have the rights to share the image. Uploaded images keep their original rights; the project license covers the code only.

A validation failure or an upload over the request limit returns an error page; the browser clears the file input, so the image must be selected again. Text fields are preserved on validation errors. The request limit is 8 MiB plus framing for `/new`.

## Limitations

This is a local prototype, not ready for public operation. It has no moderation, abuse prevention, rate limiting, editing, deletion or contributor accounts. Pagination lists 20 records at a time.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md).
