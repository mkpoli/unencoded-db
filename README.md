# 珍字集覽 · Rare Character Compendium

A Glyph Atlas evidence wiki for rare characters: ones Unicode lacks, variants, misprints and uncertain forms, each recorded with where it was seen. The records can support proposals to IRG. Records can be created and edited anonymously; each change is attributed to a browser identity.

What goes in and how records are written is set out in [docs/principles.md](docs/principles.md).

When two records are the same character, and how to merge them, is set out in [docs/unification.md](docs/unification.md).

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

## Evidence dates

Report dates, original dates and dates in a citation chain keep the contributor's transcription. Chinese and Japanese era dates use the [HuTime Calendar Conversion API](https://ap.hutime.org/cal/). Each HuTime conversion records its query, precision and inclusive Western-calendar bounds. For example, 明萬曆34年 runs from 1606-02-07 through 1607-01-27. The chronology files it under 1606. Dates already in the Western calendar use the same 1582 Julian/Gregorian cutover. An ambiguous or unreadable expression stays available as entered. A dynasty name or the prefix 日本 can identify the intended calendar.

The local setup and production release run the date sweep after applying migrations. Saving a sighting retries its unresolved dates. To retry all unresolved dates locally, run `bun scripts/sweep-dates.ts --local`. Add `--recheck` to verify existing readings again. A failed lookup preserves the previous reading. The sweep also rebuilds source years, earliest sightings and decade counts. JSON exports include a `date_readings` dictionary keyed by the original wording. CSV exports carry the same readings for each sighting in the `date_readings` column.

## Publishers

The Sources page filters direct and intermediate citations by publisher. A contributor can choose a suggested publisher or enter a new name. The directory groups verified spellings such as 江蘇教育出版社 and 江苏教育出版社. Citations, exports and revision history retain the submitted name. Only publishers cited by a visible record appear in suggestions. The release runs `scripts/sweep-publishers.ts` to reconcile legacy lookup keys. The local setup runs the same sweep.

## Agents

`https://rare.glyphatlas.org/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io/) endpoint over Streamable HTTP, open without sign-in. In Claude Code:

```sh
claude mcp add --transport http rare https://rare.glyphatlas.org/mcp
```

| Tool | Does |
|---|---|
| `find_similar_records` | Lists the records that may show the same form as a description sequence |
| `search_records` | Searches the records by description, character or word |
| `get_record` | Reads a record with its claims, sightings and picture addresses |
| `add_record` | Adds a character with up to five sightings |
| `add_sighting` | Adds evidence to a record |

A write passes the same checks and rate limits as the forms. A picture is given by its address and fetched by the site, up to ten from other sites in one call, and stands as its own thumbnail. The writes of one connection carry one anonymous name, kept by the `Mcp-Session-Id` the endpoint hands out; that id is no browser session and cannot be signed in. The tools are defined in `src/routes/mcp/_tools.server.ts`.

An agent can sign in, and then writes under a person's name. The site is the OAuth 2.1 authorization server for its own endpoint: a client finds it at `/.well-known/oauth-protected-resource`, registers itself at `/oauth/register`, and opens `/oauth/authorize` in the person's browser, where they sign in through Glyph Atlas and allow it. The token it then gets from `/oauth/token` lasts a year and can be handed back at `/oauth/revoke`. In Claude Code, `/mcp` → `rare` → Authenticate starts it. The flow is in `src/lib/server/agents.ts`.

## Data model

| Table | Holds |
|---|---|
| `entries` | One character: script, status, description, radical, strokes, and the summary a gallery tile draws |
| `claims` | What a record states more than once: description sequences, composition, readings, meanings, codes, related characters, IVD, categories, collections, tags |
| `sightings` | One place the character was seen: where, page, date, context, style, source types |
| `sources` | A citation, stored once however many sightings give it. A sighting cites the work the character appears in and can name the sources it was found through |
| `date_readings`, `evidence_dates` | Calendar readings and the view of transcribed dates in sources, sightings and revision history |
| `date_index_state` | Generation used to retry writes when their date readings change |
| `publishers`, `publisher_aliases` | Publisher identities and reviewed alternative spellings for the source filter |
| `sighting_media` | A sighting's pictures, each with its mark and thumbnail |
| `revisions` | The journal: every state of an entry or a sighting, with its author |
| `categories`, `category_changes` | The categories, each with a fixed name, a label, a parent and a place among its siblings, and the log of their changes |
| `entry_tags`, `tag_counts` | The index behind lists, filters, radicals and search |
| `reports`, `people`, `sessions` | Moderation and identity |
| `agent_clients`, `agent_codes`, `agent_tokens` | Agent sign-in: the registered clients, the codes a person granted and the tokens traded for them, both kept as hashes |

A claim is a row of `kind`, `value` and JSON `data`; the kinds and their form fields are in `src/lib/claims.ts`, and a new kind needs no migration. Categories are rows of `categories`, arranged on `/categories` and changed through `POST /api/categories`; collections are listed in `src/lib/genres.ts`. The character sets, dictionaries and glyph registries a record can state a code in are listed in `src/lib/registries.ts`; a record with a Unicode code for an ideograph also counts as registered in zi.tools, yedict and GlyphWiki. Unicode, zi.tools, yedict, GlyphWiki and MJ carry a mark, and the list narrows to the records in a marked work with `?in=<id>` or to the ones not in it with `?out=<id>`, each repeatable. `entries.marks` repeats the marked works a record is in, for the short tags on a gallery tile, and the JSON export gives it as an array.

Each claim also carries three links, all inside its own record:

| Column | Holds |
|---|---|
| `key` | Eight lowercase letters and digits that name the claim within its record. It is made once, with the claim, and stays through every edit; forms, other claims and past versions refer to the claim by it |
| `sightings` | A JSON array of the ids of the sightings that support the claim: none, one or several, each a sighting of the same record, at most 20 |
| `under` | A JSON array of the keys of the claims under which this one holds |

Only a meaning or a reading can be a scope. A reading may hold under meanings, and a related character under meanings, readings or both; a meaning and every other kind (descriptions, composition, codes, IVD, categories, collections, tags) state a fact of the whole record and have no scope. A reference to a key that names no claim, or a claim that cannot be a scope, is refused, and removing a meaning or a reading removes it from every scope in the same save. A revision's snapshot repeats the claims with their keys and links, so a restored version brings its links back, without the sightings the record no longer has.

The CSV export has one column for each kind of claim, and a claim names its links after its value: `東 (usage) [under: east | cmn:dōng] [evidence: #3 #7]`, where the numbers are values of `sighting_id`. The JSON export carries `key`, `sightings` and `under` as stored.

## PUA fonts

The **Fonts** page previews each glyph style, lets readers type or insert characters from the gallery, and links each glyph to its record. **Download fonts (TTF + OTF)** downloads a ZIP built from the public records and composer versions current when the download starts. Each glyph style has its own font family. Install either format for each family.

The archive includes component licences and a `mapping.json` that pairs each record code with its copyable character and private-use code point. Assignments start at U+E000 for record 1 and continue through the supplementary private-use areas. Hidden and merged records leave gaps. Each style uses the record’s primary drawing and layout. Where a drawing is unavailable, the font uses a monochrome tracing of the marked character in the cover image or, if that too is unavailable, a hollow square. Descriptions with Shuishu components use a placeholder because the chart font has no stated redistribution terms. The mapping identifies the source for each record and style and links to the sighting for a marked cover.

## Record codes

A record's id is stored as an integer and shown in hexadecimal as `R+A1C2`, beside the same digits spelled with the first sixteen characters of the 千字文 (天 = 0 … 張 = F): 盈地辰玄. The 千字文 digits were proposed by NGWU YOH (chat message, 2026-11-14, unpublished).

A code typed whole into search, in either spelling, opens its record.

## Radicals

A record is filed under a radical read from its first description. The head of a description is the part that holds its radical, and `src/lib/radicals.ts` chooses it by how often each part, in each place of a description, holds the radical of an encoded ideograph. The path runs from a Kangxi radical through each character down to the head: ⿺克卡 is filed `儿兄克`. A radical the record states stands in place of the one read, unless the description leads further down the same path. A stated character with no Kangxi radical, such as ㄏ, is a radical outside the Kangxi set.

A record holds a `b:` tag for its path and for each path above it, so `?radical=儿` lists the records under 克 as well, and a `b!` tag for the path its stated radical names. A path longer than a Kangxi radical stands as a radical of its own once a record states it, or once ten records stay in it after the branches standing under it are taken out; until then its records show under the path above. Stating 男 on one record therefore gathers every record read as `田男` under 男. `/radicals` lists the radicals that stand, the ones outside the Kangxi set last.

Radicals beyond the 214 of the Kangxi dictionary, adding one whenever a character needs it, and the threshold of ten records were proposed by NGWU YOH (chat messages, 2026-11-06 to 2026-11-15, unpublished).

A record is filed when it is written. `bun scripts/file-radicals.ts --local` (or `--remote`) files every listed record again, for records written before radicals were indexed and after the tables are rebuilt. Pause writes (`WRITES_PAUSED`) for the run: a record written during it keeps its earlier path until it is written again.

## Search index

Each entry indexes at most 400 distinct terms, drawn from its fields, its claims and its visible sightings. Terms beyond that limit are not searchable; changing this limit requires reindexing existing entries.

## Character drawings

The gallery draws each record's IDS with [han-compose](https://github.com/mkpoli/han-compose), from the composer export at `https://ids-input-composer.mkpoli.workers.dev/`. The export's files and the drawn paths stay in the `MEDIA` bucket under `composer/` and `glyphs/`. A missing drawing is composed in the background, and `/api/glyph?ids=…&v=…` answers one the page did not have. Only descriptions on visible records are drawn. A record's page draws one set of styles for each form its descriptions name; descriptions that normalize or spell the same form share the drawing.
In the character form, open **Adjust layout** and choose a glyph style before moving or resizing its parts. Each of the five styles saves its own placement.

A description can carry a layout. The keys are component paths such as `1.0`, the first part of the second part, and the values are six-number SVG affine matrices. The character form adjusts the first description, and the gallery uses the saved layout for each drawing.

Records returned by `/api/entries` may carry a plain map of placements shared by every style, or an object with a `faces` map keyed by glyph style and an optional legacy `shared` map. A missing face uses `shared` when present. An empty face map restores the composer's layout for that face. For `/api/glyph?ids=…&v=…&layout=…`, pass only the matrix map for the requested style.

## Third-party materials

The list of Japanese era names used to disambiguate HuTime responses is adapted from the [DILA Time Authority Database](https://github.com/DILA-edu/Authority-Databases/tree/b4cf4b4/authority_time), licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

The IDS editor uses separately licensed data and fonts. See the [third-party notices](static/third-party/ids-input/NOTICE.md); redistribution rights for some materials remain unverified.

`static/unihan/` holds the radical, total stroke count, definition, readings and variants of each ideograph, taken from `kRSUnicode`, `kTotalStrokes`, `kDefinition`, `kMandarin`, `kCantonese`, `kJapanese`, `kHangul`, `kVietnamese` and the variant fields of [Unihan 18.0.0](https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip) (Copyright Unicode, Inc., [Unicode License v3](https://www.unicode.org/license.txt)). `bun scripts/build-unihan.ts <Unihan.zip>` rebuilds it.

`src/lib/radical-tables.ts` holds what files a description under a radical: the radical of each ideograph and the forms of each radical from `kRSUnicode`, the radicals' stroke counts from `kTotalStrokes` (both Unihan 18.0.0), the ideograph each radical and stroke character stands for from [EquivalentUnifiedIdeograph 18.0.0](https://www.unicode.org/Public/18.0.0/ucd/EquivalentUnifiedIdeograph.txt) (Copyright Unicode, Inc., [Unicode License v3](https://www.unicode.org/license.txt)), and counts over BabelStone's IDS table of how often each part of a description holds the radical. `bun scripts/build-radicals.ts <Unihan.zip> <EquivalentUnifiedIdeograph.txt>` rebuilds it.

`src/lib/unicode-age.ts` holds the version of Unicode that first assigned each code point of the ideograph blocks, taken from [DerivedAge 18.0.0](https://www.unicode.org/Public/18.0.0/ucd/DerivedAge.txt) (Copyright Unicode, Inc., [Unicode License v3](https://www.unicode.org/license.txt)). `bun scripts/build-unicode-age.ts <DerivedAge.txt>` rebuilds it.

## Cloudflare bindings

The Worker uses a D1 database (`DB`), an R2 bucket (`MEDIA`), and rate limit bindings (`ADDS` and `EDITS`). `IP_SALT` is an optional secret for hashing contributor IP addresses, and `WRITES_PAUSED=1` disables writes.
