# Fonts

Several webfont subsets draw the palette parts that few installed fonts cover: the CJK strokes, CJK
Radicals Supplement, the parts beyond the Basic Multilingual Plane (CJK Extensions B–J), the
BabelStone PUA glyphs for numbered components with no IDS fragment, and the editor's empty-slot mark
⬚ (U+2B1A). Another draws the sixteen ideographic description characters for sequence text where no
installed font has them. Kureedo and GenZui Sans supply the optional Kaisho face.

`scripts/build_ids_parts.py --font` cuts them from
`data/ids-parts.json`, so they are rebuilt with the palette. `fonts.css` names them `IDS Strokes`
(U+2B1A, U+31C0–U+31E3) and `IDS Parts` (U+2E80–U+2EFF, U+31E4–U+31EF, U+20000–U+3FFFF), with ranges
that do not overlap, and `IDS Operators` (U+2FF0–U+2FFF; the first twelve from Noto, the four newer
ones from Jigmo) for sequence text. The rest of the Basic Multilingual Plane, Extension A included,
comes from the reader's own CJK font.

- `NotoSansCJKjp-ids-strokes.woff2` (3.4 KB, 37 characters): Noto Sans CJK JP 2.004
  (<https://github.com/notofonts/noto-cjk>, tag `Sans2.004`, the variable font instanced at weight
  400, SHA-256 `240c9b83bf7b386edbae39995ae7e068ed4583f484d92e4a74c34158b5f27b1a`), © 2014-2021
  Adobe, SIL Open Font License 1.1 (`OFL-NotoSansCJK.txt`). The Reserved Font Name is `Source`, which
  the family name does not use.
- `NotoSansCJKjp-ids-operators.woff2` (2.0 KB, 12 characters): U+2FF0–U+2FFB from the same Noto Sans
  CJK JP 2.004 source as the strokes subset, named `IDS Operators`, SIL Open Font License 1.1
  (`OFL-NotoSansCJK.txt`), SHA-256 `d2b33d199ce5ad6edbf8b9f1ab11e719cb306a8d63ac5f07fddb5fde70cf2890`.
  Rebuild with `uv run --with 'fonttools[woff]' pyftsubset NotoSansCJK-Regular.ttc --font-number=0
  --unicodes=2FF0-2FFB --flavor=woff2 --output-file=fonts/NotoSansCJKjp-ids-operators.woff2`.
- `Jigmo-ids-operators.woff2` (1.5 KB, 4 characters): U+2FFC–U+2FFF, the description characters
  Unicode added after the pinned Noto Sans CJK, named `IDS Operators`. Jigmo (字雲) 20250912 by
  Koichi Kamichi (<https://kamichikoichi.github.io/jigmo/>), CC0 1.0 (`LICENSE-Jigmo.txt`), and the
  same archive as the fallback shards. SHA-256
  `6d0b56a57d435cfc59c1dda56cbeb123ec081f0b586898bfe5b2c0d31399ef50`. Rebuild with
  `uv run --with 'fonttools[woff]' pyftsubset Jigmo.ttf --unicodes=2FFC-2FFF --flavor=woff2
  --output-file=fonts/Jigmo-ids-operators.woff2`.
- `IDSNumbered.woff2` (38 KB, 69 characters): BabelStone Han PUA 1.472 by Andrew West
  (<https://www.babelstone.co.uk/Fonts/PUA.html>), cut to the PUA code points IDS.TXT note 6 gives
  the numbered components with no IDS fragment, U+E080–U+F8DF. Named `IDS Numbered`; the source is
  under the Arphic Public License (`LICENSE-BabelStoneHanPUA.txt`). The PUA code points are not
  stable; `data/numbered-pua-outlines.json.gz` records the font version and digest. Rebuild with
  `uv run scripts/build_numbered_pua.py`.
- `Plangothic-ids-parts.woff2` (444 KB, 3,486 characters): Plangothic (遍黑体) P1 and P2 V2.9.5795 by
  Fitzgerald P. Köeingsegg
  (<https://github.com/Fitzgerald-Porthmouth-Koenigsegg/Plangothic-Project>), merged into one
  subset, SIL Open Font License 1.1 (`OFL-Plangothic.txt`). The font declares no Reserved Font Name.
  Source SHA-256s: P1 `550b5d0775b15405946b18f4843df439a51e69508d7e6778d94c1f7a53dc5ad6`, P2
  `681933370adfe0fc7253f77735275a82fea09fe4f8adba907bdeb46c110daf8f`.
- `Plangothic-ids-project.woff2` (4.6 KB, 1 character): U+33473 𳑳 from Plangothic P2 V2.9.5795,
  the same source and licence as above, named `IDS Project`; it lets the project's characters render
  in the Sans face before the system fonts. Rebuild with
  `uv run scripts/build_project_font.py` after changing `data/ids-characters.tsv`.

`Kureedo-Regular.woff2` (2.8 MB) supplies the optional `Kureedo` Kaisho face. Kureedo v0.4.3, Copyright The Klee Project Authors, SIL Open Font License 1.1 (`OFL-Kureedo.txt`), from [mkpoli/kureedo](https://github.com/mkpoli/kureedo); this woff2 SHA-256 `678769b18123201d292436e854121de9b636162ca595e5e9fb71684636ead430`.

`Kureedo-label.woff2` (23 KB, 97 characters: ASCII, 楷 and 書) is a subset of the same Kureedo file, under the same licence, named `Kureedo Label`, with the copyright and licence records of the original. The font switch draws the Kaisho option's name and its Aa sample with it, so a page keeps the full face until the reader chooses Kaisho. SHA-256 `90cb39895d10fb19299becf0e03ba53b04df2becf459276aff27a4cffef9a538`. Rebuild with `uv run --with 'fonttools[woff]' pyftsubset fonts/Kureedo-Regular.woff2 --unicodes='U+0020-007E,U+66F8,U+6977' --flavor=woff2 --name-IDs='*' --name-languages='*' --output-file=fonts/Kureedo-label.woff2`.

`GenZuiSans-Regular.woff2` (2.3 MB) supplies the characters Kureedo lacks. GenZui Sans 0.105, SIL Open Font License 1.1 (`OFL-GenZuiSans.txt`), from [mkpoli/GenZui](https://github.com/mkpoli/GenZui); woff2 SHA-256 `efb3b0bf65f178b52ede78a552cf7d642d1c9bbd47c3fbddf860d70ec92d7f7a`.

## Fallback shards

`fonts/unicode/` holds `IDS Fallback`, the composer's outlines as a webfont, one file per
256-code-point shard listed in `fonts/unicode.json`. The faces are not in any stylesheet: the app
registers a shard as a `FontFace` the first time a character in its range appears
(`src/svelte/fallback-font.js`), so a page downloads only the shards it shows. A shard also carries
the palette parts, the empty-slot mark ⬚, the description characters and the standard Han
ideographs (CJK Unified Ideographs, Extension A and the compatibility ideographs) that the composer
has no outline for. Those come from Jigmo (字雲, by the GlyphWiki contributors, CC0 1.0,
`LICENSE-Jigmo.txt`), with the compatibility ideographs from Unifont 18.0.01 (GNU GPL 2+ with the
font embedding exception, or SIL OFL 1.1; its notices name the authors, among them Roman Czyborra
and Paul Hardy). 629 shards, 78,473 characters, 21,812 of them filled from a font, 13.7 MB all together.
`uv run scripts/build_unicode_font.py` rebuilds them and fetches both sources itself.

`NotoSerifTangut-Regular.woff2` supplies the `IDS Tangut` face for the editor,
examples, palette and search results. Noto Serif Tangut 2.168, Copyright 2021 Google
LLC, SIL Open Font License 1.1 (`OFL-NotoSerifTangut.txt`), from
[notofonts/noto-fonts](https://github.com/notofonts/noto-fonts/tree/main/unhinted/ttf/NotoSerifTangut).
It covers all 768 original Tangut components. Rebuild with
`uv run scripts/build_tangut_font.py`; the script pins the source SHA-256.
Its outlines are also exported by `scripts/build_tangut_outlines.py` for composition
and SVG/PNG export, under the same font licence.

## IDS Seal

`IDSSeal-Regular.woff2` is a 1,383-glyph derivative of
[Kaiyuan Small Seal](https://github.com/frankslin/kaiyuan-small-seal-font) at revision
`97433695858330ec9fdb7de9c4604da2f635eba6`, by Kaiyuan Small Seal Font Contributors.
It covers the expanded palette, the curated crosswalks and the heads of the bundled
CHISE descriptions.
Other Small Seal code points need another installed font.

The SVGs are traced from the Chen Changzhi edition of 說文解字. Upstream describes the
font as under review; these outlines have not received a separate glyph-by-glyph
review here. They can differ from the Jiguge shapes described by CHISE. Upstream
marks 814 selected glyphs `approved`, 8 `manual`, and 561 `aligned`. The outline
metadata retains each glyph's full review record.
`IDSSeal-sources.tar.gz` includes the original SVGs with crop references, upstream
provenance and approval tables, and the original license. File digests and the pinned
revision are in `small-seal-sources.json`. The 49 curated crosswalk glyphs live in
`scripts/data/small-seal/` and are pinned by `supplements.json`; their evidence and
digests are checked when the palette is built.

The font uses the verbatim [Kaiyuan font license](LICENSE-IDSSeal.txt). Although its
header calls it SIL OFL 1.1, its conditions differ from the standard SIL license.
The derivative family is named IDS Seal and retains Kaiyuan Small Seal in the
Compatible Fullname field. The license and copyright notice are embedded in the font.

Build the webfont and `data/small-seal-outlines.json.gz` with
`uv run scripts/build_small_seal_font.py`. This uses the bundled SVG sources and the pinned
crosswalk SVGs, checks their digests, converts cubic curves to quadratic curves with a 0.5-unit error bound,
and writes deterministic font and outline files. Exact-description mappings in the
outline data come from CHISE and retain its GPL-2.0-or-later license.

## IDS New Korean

`IDSNewKorean.woff2` is a four-glyph derivative of
[Nanuun-saram](https://commons.wikimedia.org/wiki/User:Nanuun-saram)'s SVG drawings of the
four unencoded letters of the New Korean Orthography (조선어 신철자법), made 2016-02-08 on
Wikimedia Commons. The font maps the seven code points A97D–A97F, D7C7 and D7FC–D7FE,
the positions proposed in OBAYASHI Muneaki, [L2/19-230R](https://www.unicode.org/L2/L2019/19230r-six-hangul-letters.pdf)
(2019-06-24). Unicode 18.0.0 leaves them unassigned; `fonts.css` gives the face the
matching `unicode-range`.

The drawings are CC BY-SA 4.0; the font and `data/new-korean-outlines.json.gz` keep that
licence, and [LICENSE-IDSNewKorean.txt](LICENSE-IDSNewKorean.txt) records the attribution.
The source SVGs, digests and letter names are in [`data/new-korean/`](../data/new-korean/).
Rebuild the font and outlines with `uv run scripts/build_new_korean.py`.

## IDS Shuishu

`IDSShuishu.woff2` maps 533 proposed Shuishu characters and radicals at the tentative allocations of
the amendment (U+1B300–U+1B4E5 and U+1B500–U+1B52E); `fonts.css` gives the face the matching
`unicode-range`. Unicode 18.0.0 leaves both ranges unassigned.

The outlines are the glyphs of `Uni1B300Shuishu`, the font embedded in the code charts of
ISO/IEC 10646 Amendment 2.2 charts (PDAM 2.2), read through the PDF's own ToUnicode map. The charts state no separate
glyph licence and neither does the spreadsheet that names the characters; the position is in
[LICENSE-IDSShuishu.txt](LICENSE-IDSShuishu.txt) and the [data notices](../data/README.md#shuishu).
Rebuild the font and `data/shuishu-outlines.json.gz` with `uv run --python 3.12 scripts/build_shuishu.py`.

## IDS Jurchen

`IDSJurchen.woff2` maps Unicode 18.0's 914 Jurchen characters and 51 radicals (U+18E00–U+19191 and
U+191A0–U+191D2), and 537 variant sequences through U+FE00–U+FE04 in a format 14 cmap; `fonts.css`
gives the face the matching `unicode-range`.

The outlines are those of Alari Xuwasun Jurchen, public beta of 2026-10-12, by Sulfa, Dooran and
Raxon7, under the SIL OFL 1.1 ([LICENSE-IDSJurchen.txt](LICENSE-IDSJurchen.txt)). This face reaches the
variants through the selectors alone, leaves out the style sets, and is converted from cubic to
quadratic outlines.
Rebuild the font and `data/jurchen-outlines.json.gz` with `uv run --python 3.12 scripts/build_jurchen.py`.

## Unicode fallback glyphs

The composer draws 56,651 additional characters from font-derived outlines when the selected export
lacks a glyph, and the same outlines ship as a webfont for text. Sources, rebuild instructions and
coverage limits are in the [data notices](../data/README.md#unicode-fallback-outlines);
[OFL-NotoUnicode.txt](OFL-NotoUnicode.txt) contains the original Noto copyright notices and SIL OFL
1.1. Extended sources use `LICENSE-Jigmo.txt`, `LICENSE-Unifont.txt`,
`OFL-UniHieroglyphica.txt` and `OFL-Iosevka.md`; per-source copyright
notices are preserved in the outline metadata.

`unicode/*.woff2` is the `IDS Fallback` family: one file per 256-code-point shard, each declared in
`unicode.css` with its own `unicode-range`, so a browser fetches a shard only where the family is
reached and no earlier font draws the character. The stacks list the reader's chosen face and the
common CJK fonts first, then `--ids-glyph-fallback`, then this family. It comes before the generic
family, so a character it covers is drawn from it even when an installed font the stack does not
name could draw it; its coverage leaves out the Han, radical and Tangut ranges those fonts carry.
The files total 8.7 MB, with a median of 3.5 KB; `unicode.json` records each one's glyph count, size
and SHA-256. Rebuild with `uv run scripts/build_unicode_font.py`, which reads the outline shards and
writes the webfont, the stylesheet and the record. Glyphs keep the composer's 1000-unit em and
baseline, and each advance is the ink's width plus its side bearings. The files carry outlines only:
without GSUB, GPOS or GDEF, Arabic joins, Indic clusters and mark attachment do not happen.

## Gongche supplement

`Plangothic-gongche.woff2` covers all 17 supplementary encoded characters in
`data/gongche-parts.json`. Rebuild it and its exact `unicode-range` rules with
`uv run scripts/build_gongche_font.py`. The builder reads the catalogue, verifies
the Plangothic P1/P2 V2.9.5795 digests listed above, and uses the same subset/merge
procedure as the general parts font. `fonts.css` imports the generated
`gongche.css`; the supplementary characters use the existing `IDS Parts` family.

Matching composer outlines are included in `data/palette-outlines.json.gz`.
BMP text uses the reader's CJK font, as in the rest of the panel. The outlined
fallback for missing BMP components uses the pinned Noto Sans CJK font.
