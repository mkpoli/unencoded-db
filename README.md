# Rare Character Compendium

A community evidence wiki for characters and glyphs. Anyone can add or revise a record with a source image and view its revision history.

A new record keeps one source image as its evidence: a photo, scan or screenshot of the character or glyph. The image is served only through its record at `/{locale}/entry/[id]/image`. Classifying the glyph is a later question.

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

Application links keep the active locale; the third-party notice is a static English file at `/third-party/README.md`. The navigation language switcher links to the same path and query string in each locale. The locale layout validates the prefix and rejects unknown or malformed segments with 404. Other paths under a valid locale render the localized error page. Creating a record redirects to its localized entry page.

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

The bucket stays private. Object keys are generated as `entries/<uuid>` and never appear in page data or HTML.

To run the checks:

```sh
bun run test
bun run check
bun run build
```

## Images

- One image per new record. Rows migrated from `0001` remain image-less. There is no editing or replacement flow.
- JPEG, PNG and WebP are accepted, identified by magic bytes. SVG, HTML, empty and unrecognised files are rejected.
- The maximum file size is 8 MiB.
- Bytes live in R2; content type and size live in D1.
- Images are not decoded or re-encoded. A corrupt file with a valid signature may fail to render in the browser.
- `POST /{locale}/new` accepts up to 8 MiB plus form framing. Other POST routes keep the 128 KiB limit.
- Image responses use the stored content type, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`, so hiding takes effect on the next request. Missing, hidden and invalid-locale images also return an uncached 404.
- Images are stripped of common metadata on upload: JPEG EXIF, XMP, IPTC and comments before the image scan, PNG text, tIME and EXIF chunks, and WebP EXIF/XMP chunks. JPEG EXIF orientation is kept; ICC colour profiles and pixel content are stored as uploaded. Image metadata is not preserved for attribution, so record credit in the bibliographic fields.


## Glyph Atlas sign-in

Sign-in is optional. Configure `ATLAS_ISSUER`, `ATLAS_CLIENT_ID`, `ATLAS_CLIENT_SECRET` and `ATLAS_PUBLIC_ORIGIN` as worker secrets or bindings, and register the exact callback URL `<ATLAS_PUBLIC_ORIGIN>/auth/callback` with the provider. The public origin must match the request origin exactly and use HTTPS, except for loopback HTTP in local development. Apply all D1 migrations before enabling the feature. The issuer and discovery endpoints must use HTTPS; discovered endpoints must share the issuer's origin. The provider must support authorization code flow, PKCE S256, client secret basic authentication and RS256 ID tokens. A token's issued-at time must be within ten minutes. No credentials are included in this repository.

Sign-in requires an anonymous contributor session. Adding evidence creates one; otherwise, select “Sign in with Glyph Atlas” and then “Continue to Glyph Atlas”. Sign-in links the contributor to the verified issuer and subject. If that identity already exists, the anonymous person is mapped to the existing person; historical entry creator IDs stay unchanged. Signing out revokes the current session. Changing to another Glyph Atlas account requires signing out first.

The protocol follows [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html), [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html), and [RFC 7636: PKCE](https://www.rfc-editor.org/rfc/rfc7636).

## Visibility

Hidden entries are absent from the listing, the entry page and the image route. Apply all migrations before serving code that filters visibility or reads the image schema. Drain old application instances before hiding entries, since older readers do not filter them, and before applying `0006`, since it removes the old URL column that older writers still use. Drain writers that do not advance revisions before applying `0007`, since their updates fail once the revision triggers exist. Hiding an entry cannot retract responses already in flight or content already loaded by a client.

## Revisions

Revising a record submits the whole evidence text and advances its revision by one. `entry_revisions` stores every version; the history page lists 20 at a time, newest first, and hidden records return 404 on the edit and history pages. A redacted snapshot shows only its revision number, recording date and a redaction marker. Images and related characters are not versioned: edits change text fields only, so the current image and comparisons belong to every revision.

Each edit form carries the revision and visibility generation it was opened at. A write succeeds only when both still match, so a form opened before another edit or a visibility change returns 409 rather than overwriting. Migration `0007_revisions.sql` backfills the current text of every record and installs triggers that require the next revision and reject changes to stored revisions. Migration `0008_edit_generation.sql` adds the generation that invalidates forms opened before a visibility change. Pause submissions, drain older writers and rehearse both migrations against a representative database before applying them; production-scale time and storage have not been measured.

## Deployment

Provision the remote bucket before deploying:

```sh
bunx wrangler r2 bucket create unencoded-db-images
```

Apply all migrations before deploying code that expects visibility and the image schema:

```sh
bunx wrangler d1 migrations apply DB --remote
```

Migration `0001` creates the base table. Migration `0002` adds `visible` and the `entries_visible_id` index. Migration `0003` adds related comparisons. Migration `0004` adds anonymous attribution. Migration `0005` adds OIDC identities and session rotation. Migration `0006` rebuilds `entries`, preserves `visible`, comparisons, attribution and the id high-water mark, recreates `entries_visible_id`, adds a unique partial `entries_image_key` index, removes the source URL column and adds `image_key`, `image_type` and `image_size`. Existing rows keep their ids and text fields; existing source URLs are dropped. Migration `0007` adds the `revision` column and `entry_revisions` with the backfill, snapshot and immutability triggers. Migration `0008` adds `edit_generation` and advances it on every visibility change. Migration `0009` adds the tombstone flag and redaction audit table, restates the snapshot triggers for the new column, and rejects any update that is not one complete scrub of a noncurrent snapshot.

The Cloudflare configuration names the production D1 database and an R2 bucket. Configure real bindings for a separate environment.

## Storage gaps

There is no global storage quota, no per-user quota and no cleanup job. An R2 put that times out after the request finishes can leave an orphan object. If the insert returns no row without an error, the object is deleted on a best-effort basis. A thrown insert error is treated as ambiguous: the Worker looks for the row and otherwise keeps the object, which can leave an orphan. Recovering other orphans requires an operator.

## Rights

Uploaders must have the rights to share the image. Image metadata is stripped, so credit belongs in the record's title, author and publisher fields. Uploaded images keep their original rights; the project license covers the code only.

A validation failure returns the form with its errors; an upload over the request limit returns 413. The browser clears the file input, so the image must be selected again. Text fields are preserved on validation errors. The request limit is 8 MiB plus framing for `/{locale}/new`.

## Continuous integration

GitHub Actions runs `bun install --frozen-lockfile` and `bun run build` for pull requests and pushes to `main`.

## Limitations

This is a local prototype without moderation, abuse prevention, rate limiting or deletion. Editing is anonymous and has no rate limit. Pagination lists 20 records at a time. Provider availability and the permitted endpoint layout have not been verified against a live Glyph Atlas deployment. Discovery and keys are fetched on each sign-in; each provider request has a five-second deadline and a 128 KiB response limit. The provider controls the identity assertions it issues.

Sessions expire after 365 days. Clearing an anonymous cookie loses its link to future contributions. Simultaneous first submissions or sign-in preparations can create separate anonymous identities, with only one cookie retained by the browser. If concurrent preparations establish different session families, signing out of one family cannot revoke an in-flight callback bound to the other; avoid concurrent preparation tabs. Expired flows and revoked sessions are not cleaned up automatically. Attribution merges are stored as person mappings; a future contributor-facing view must resolve them. Rate limiting and storage retention need operational policy before public use.

**Public launch is blocked:** moderator authorization and handling sensitive current content are required. An internal primitive can irreversibly redact noncurrent snapshots, with an audit record; it has no public interface. Current records and other revisions may still contain the same text. Redaction cannot retract copies in caches, logs, database backups or point-in-time recovery. Hiding an entry conceals its history, and restoring it republishes its unredacted snapshots. Apply the redaction migration before deploying readers or writers that use it.

## License

The project is licensed under the [MIT License](LICENSE). Notices for third-party runtime components are in [third-party notices](static/third-party/README.md).
