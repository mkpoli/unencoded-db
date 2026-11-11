# 珍字集覽 · Rare Character Compendium

A Glyph Atlas evidence wiki documenting Unicode-unencoded characters and unifiable variants for prospective IRG submissions. Records can be created and edited anonymously; each change is attributed to a browser identity.

## Local development

Install [Bun](https://bun.sh/) and run:

```sh
bun install
bun run db:local
bun run build
bunx wrangler dev --local --infer-origin-from-routes=false
```

The local database and object store are separate from Cloudflare resources. The tests also require Python 3. To run checks:

```sh
bun run test
bun run check
bun run build
```

## Glyph Atlas sign-in

Sign-in requires a confidential client registered with the Glyph Atlas issuer for the `openid` and `profile` scopes. Register the exact callback URL for the site; the local preview at `http://127.0.0.1:8798` uses `http://127.0.0.1:8798/auth/callback`. Set `ATLAS_CLIENT_ID` and `ATLAS_CLIENT_SECRET` in a local `.dev.vars` file or as Cloudflare secrets. `ATLAS_ISSUER` defaults to `https://glyphatlas.org/api/auth`.

Without client credentials, the site offers anonymous contributions. Signing in links the browser's anonymous contributions to the account; signing out ends the local session.

## Data model

| Table | Holds |
|---|---|
| `entries` | One character: script, status, description, radical, strokes, and the summary a gallery tile draws |
| `claims` | What a record states more than once: description sequences, composition, readings, meanings, codes, related characters, IVD, categories, collections, tags |
| `sightings` | One place the character was seen: where, page, date, context, style, source types |
| `sources` | A citation, stored once however many sightings give it |
| `sighting_media` | A sighting's pictures, each with its mark and thumbnail |
| `revisions` | The journal: every state of an entry or a sighting, with its author |
| `entry_tags`, `tag_counts` | The index behind lists, filters and search |
| `reports`, `people`, `sessions` | Moderation and identity |

A claim is a row of `kind`, `value` and JSON `data`; the kinds and their form fields are in `src/lib/claims.ts`, and a new kind needs no migration. Categories and collections are listed in `src/lib/genres.ts`.

## Search index

Each entry indexes at most 400 distinct terms, drawn from its fields, its claims and its visible sightings. Terms beyond that limit are not searchable; changing this limit requires reindexing existing entries.

## Character drawings

The gallery draws each record's IDS with [han-compose](https://github.com/mkpoli/han-compose), from the composer export Glyph Atlas publishes at `https://glyphatlas.org/atlas/composer/`. The export's files and the drawn paths stay in the `MEDIA` bucket under `composer/` and `glyphs/`. A missing drawing is composed in the background, and `/api/glyph?ids=…` answers one the page did not have. Only descriptions on visible records are drawn.

## Third-party materials

The IDS editor uses separately licensed data and fonts. See the [third-party notices](static/third-party/ids-input/NOTICE.md); redistribution rights for some materials remain unverified.

## Cloudflare bindings

The Worker uses a D1 database (`DB`), an R2 bucket (`MEDIA`), and rate limit bindings (`ADDS` and `EDITS`). The database ID in `wrangler.jsonc` is a placeholder; provision the resources and apply the D1 migrations before configuring an environment. `IP_SALT` is an optional secret for hashing contributor IP addresses, and `WRITES_PAUSED=1` disables writes.

The current checkout is a prototype. Review moderation, data retention, upload storage, access control, and concurrent writes before opening it to the public.
