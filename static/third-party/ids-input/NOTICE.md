# ids-input third-party notices

This notice covers the installed `ids-input` revision `3e0c0e0f`, its imported data and the fonts referenced by its stylesheet, and the installed `@han-compose/composer` revision `f71e9de` with the outlines it carries. The [upstream data notes](data/README.md), [font notes](fonts/README.md), and license files alongside them give the source notices. Some links in those copied notes refer to files in the upstream package.

## Code and data

- `ids-input` code: Copyright (c) 2026 mkpoli, [MIT license](LICENSE). Data and fonts have separate terms.
- `@han-compose/composer` code: Copyright (c) 2026 mkpoli, [MIT license](https://github.com/mkpoli/han-compose/blob/f71e9de/js/LICENSE). The app serves its bundled script outlines from `src/lib/composer-data.ts`; their sources and terms are in the [upstream data notes](https://github.com/mkpoli/han-compose/blob/f71e9de/data/README.md) and the [font notices](fonts/README.md).
- BabelStone IDS by Andrew West: the upstream notes describe its IDS data as public domain; the source is [IDS.TXT](https://www.babelstone.co.uk/CJK/IDS.TXT). The installed data also includes BabelStone Tangut IDS.
- `ids-parts.json`: the first-stroke column derives from [Rime's five-stroke dictionary](https://github.com/rime/rime-stroke), attributed to 四季的風, 雪齋, Kunki Chou and 宋天. It is LGPL-3.0; the [author notice](data/licences/rime-stroke-AUTHORS.txt), [LGPL](data/licences/rime-stroke-LGPL-3.0.txt) and [GPL](data/licences/GPL-3.0.txt) texts are included. Other palette sources include BabelStone, Henry Chan's MIT-licensed [ids](https://github.com/hfhchan/ids), and Unihan under [Unicode License v3](data/licences/Unicode-3.0.txt).
- Component forms derive from [han-compose](https://github.com/mkpoli/han-compose) (MIT), Unicode's EquivalentUnifiedIdeograph data (Unicode License v3), and [cjkvi-variants](https://github.com/cjkvi/cjkvi-variants) (public domain), according to the data notes.
- Component names and folds and character vocabulary are described upstream as CC BY-SA 4.0. Their sources include [KANJIDIC2](https://www.edrdg.org/kanjidic/kanjidic2.xml.gz) by the Electronic Dictionary Research and Development Group and Japanese and Chinese Wikipedia; see the [data notes](data/README.md#component-namestsv) for source-level attribution, additional licenses, and changes. License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Character information includes Unihan (Unicode License v3) and [Open Tangut](https://github.com/imlooh/open-tangut), Copyright (c) 2026 Leah, [MIT](data/COPYING-open-tangut.txt). Upstream says Open Tangut incorporates Wiktionary entries (CC BY-SA 4.0) and CCAMC data for which no license is stated. The combined Tangut data is not MIT alone; rights in the CCAMC data remain uncertain.

## Fonts

The names below identify upstream font sources and the modified or subset faces distributed by `ids-input`. Full notices and conditions are in the linked files.

- Noto Sans CJK JP subsets: © 2014–2021 Adobe, [SIL OFL 1.1](fonts/OFL-NotoSansCJK.txt).
- Plangothic parts, project and Gongche subsets: Fitzgerald P. Köeingsegg, [SIL OFL 1.1](fonts/OFL-Plangothic.txt).
- Jigmo operator subset and fallback glyphs: Koichi Kamichi and GlyphWiki contributors, [CC0 1.0](fonts/LICENSE-Jigmo.txt).
- BabelStone Han PUA numbered-component subset by Andrew West: [Arphic Public License](fonts/LICENSE-BabelStoneHanPUA.txt).
- Kureedo and its label subset: The Klee Project Authors and The Kureedo Project Authors, [SIL OFL 1.1](fonts/OFL-Kureedo.txt). GenZui Sans: [copyright notices and SIL OFL 1.1](fonts/OFL-GenZuiSans.txt).
- Noto Serif Tangut: Copyright 2021 Google LLC, [SIL OFL 1.1](fonts/OFL-NotoSerifTangut.txt).
- IDS Seal is derived from Kaiyuan Small Seal by Kaiyuan Small Seal Font Contributors. Its [license](fonts/LICENSE-IDSSeal.txt) bears an OFL 1.1 heading but differs from the standard OFL conditions; consult its text.
- IDS New Korean derives from four drawings by [Nanuun-saram](https://commons.wikimedia.org/wiki/User:Nanuun-saram), converted into a font and assigned proposed positions. The [attribution notice](fonts/LICENSE-IDSNewKorean.txt) links each drawing and the proposal; the drawings and derivative are [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- IDS Jurchen derives from Alari Xuwasun Jurchen by Sulfa, Dooran and Raxon7, [SIL OFL 1.1](fonts/LICENSE-IDSJurchen.txt).
- Fallback font shards include Noto, Jigmo and Unifont glyphs; upstream also identifies UniHieroglyphica and Iosevka in its fallback sources. See [Noto notices](fonts/OFL-NotoUnicode.txt), [Unifont license](fonts/LICENSE-Unifont.txt), [UniHieroglyphica license](fonts/OFL-UniHieroglyphica.txt), and [Iosevka license](fonts/OFL-Iosevka.md).

### IDS Shuishu: rights uncertain

The IDS Shuishu font derives from `Uni1B300Shuishu` embedded in the [ISO/IEC 10646 Amendment 2.2 chart](https://www.unicode.org/wg2/docs/n4922-5theditionPdam2-2-charts.pdf). The installed [upstream notice](fonts/LICENSE-IDSShuishu.txt) says the chart and embedded font state no separate glyph redistribution terms. No font license or permission to redistribute the outlines is established by these notices. The accompanying spreadsheet by Andrew West also states no license, according to the data notes. Review and rights clearance are needed before relying on redistribution rights.
