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

Sign-in requires a confidential client registered with the Glyph Atlas issuer for the `openid` and `profile` scopes. Register the exact callback URL for the site; the local preview at `http://127.0.0.1:8798` uses `http://127.0.0.1:8798/auth/callback`. Set `ATLAS_ISSUER` (`https://glyphatlas.org/api/auth`), `ATLAS_CLIENT_ID` and `ATLAS_CLIENT_SECRET` in a local `.dev.vars` file or as Cloudflare secrets.

Without client credentials, the site offers anonymous contributions. Signing in links the browser's anonymous contributions to the account; signing out ends the local session.

## Data model

| Table | Holds |
|---|---|
| `entries` | One character: script, status, description, radical, strokes, and the summary a gallery tile draws |
| `claims` | What a record states more than once: description sequences, composition, readings, meanings, codes, related characters, IVD, categories, collections, tags |
| `sightings` | One place the character was seen: where, page, date, context, style, source types |
| `sources` | A citation, stored once however many sightings give it. A sighting cites the work the character appears in and, optionally, a second source it was found through |
| `sighting_media` | A sighting's pictures, each with its mark and thumbnail |
| `revisions` | The journal: every state of an entry or a sighting, with its author |
| `entry_tags`, `tag_counts` | The index behind lists, filters and search |
| `reports`, `people`, `sessions` | Moderation and identity |

A claim is a row of `kind`, `value` and JSON `data`; the kinds and their form fields are in `src/lib/claims.ts`, and a new kind needs no migration. Categories and collections are listed in `src/lib/genres.ts`. The character sets, dictionaries and glyph registries a record can state a code in are listed in `src/lib/registries.ts`; a record with a Unicode code for an ideograph also counts as registered in zi.tools, yedict and GlyphWiki. Unicode, zi.tools, yedict, GlyphWiki and MJ carry a mark, and the list narrows to the records in a marked work with `?in=<id>` or to the ones not in it with `?out=<id>`, each repeatable. `entries.marks` repeats the marked works a record is in, for the short tags on a gallery tile, and the JSON export gives it as an array.

Each claim also carries three links, all inside its own record:

| Column | Holds |
|---|---|
| `key` | Eight lowercase letters and digits that name the claim within its record. It is made once, with the claim, and stays through every edit; forms, other claims and past versions refer to the claim by it |
| `sightings` | A JSON array of the ids of the sightings that support the claim: none, one or several, each a sighting of the same record, at most 20 |
| `under` | A JSON array of the keys of the claims under which this one holds |

Only a meaning or a reading can be a scope. A reading may hold under meanings, and a related character under meanings, readings or both; a meaning and every other kind (descriptions, composition, codes, IVD, categories, collections, tags) state a fact of the whole record and have no scope. A reference to a key that names no claim, or a claim that cannot be a scope, is refused, and removing a meaning or a reading removes it from every scope in the same save. A revision's snapshot repeats the claims with their keys and links, so a restored version brings its links back, without the sightings the record no longer has.

The CSV export has one column for each kind of claim, and a claim names its links after its value: `東 (usage) [under: east | cmn:dōng] [evidence: #3 #7]`, where the numbers are values of `sighting_id`. The JSON export carries `key`, `sightings` and `under` as stored.

## Record codes

A record's id is stored as an integer and shown in hexadecimal as `R+A1C2`, beside the same digits spelled with the first sixteen characters of the 千字文 (天 = 0 … 張 = F): 盈地辰玄. The 千字文 digits were proposed by NGWU YOH (chat message, 2026-11-14, unpublished).

## Search index

Each entry indexes at most 400 distinct terms, drawn from its fields, its claims and its visible sightings. Terms beyond that limit are not searchable; changing this limit requires reindexing existing entries.

## Character drawings

The gallery draws each record's IDS with [han-compose](https://github.com/mkpoli/han-compose), from the composer export at `https://ids-input-composer.mkpoli.workers.dev/`. The export's files and the drawn paths stay in the `MEDIA` bucket under `composer/` and `glyphs/`. A missing drawing is composed in the background, and `/api/glyph?ids=…` answers one the page did not have. Only descriptions on visible records are drawn.

## Third-party materials

The IDS editor uses separately licensed data and fonts. See the [third-party notices](static/third-party/ids-input/NOTICE.md); redistribution rights for some materials remain unverified.

`static/unihan/` holds the radical, total stroke count, definition, readings and variants of each ideograph, taken from `kRSUnicode`, `kTotalStrokes`, `kDefinition`, `kMandarin`, `kCantonese`, `kJapanese`, `kHangul`, `kVietnamese` and the variant fields of [Unihan 18.0.0](https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip) (Copyright Unicode, Inc., [Unicode License v3](https://www.unicode.org/license.txt)). `bun scripts/build-unihan.ts <Unihan.zip>` rebuilds it.

`src/lib/unicode-age.ts` holds the version of Unicode that first assigned each code point of the ideograph blocks, taken from [DerivedAge 18.0.0](https://www.unicode.org/Public/18.0.0/ucd/DerivedAge.txt) (Copyright Unicode, Inc., [Unicode License v3](https://www.unicode.org/license.txt)). `bun scripts/build-unicode-age.ts <DerivedAge.txt>` rebuilds it.

## Cloudflare bindings

The Worker uses a D1 database (`DB`), an R2 bucket (`MEDIA`), and rate limit bindings (`ADDS` and `EDITS`). `IP_SALT` is an optional secret for hashing contributor IP addresses, and `WRITES_PAUSED=1` disables writes.
