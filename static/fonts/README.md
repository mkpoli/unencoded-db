# Glyph style specimens

Three one-glyph subsets let the glyph style switch draw its specimen 永 in the Fangsong, Regular
Kai and Wen Kai faces without loading their full exports.

- `specimen-zhuque.woff2` (1,064 bytes, 永 U+6C38): Zhuque Fangsong v0.212 by TrionesType,
  Copyright 2023 JadeFoci, SIL Open Font License 1.1 (`../third-party/ids-input/fonts/OFL-Zhuque.txt`).
  Cut from `ZhuqueFangsong-Regular.woff2` (SHA-256
  `5cb9aca8a85825a204ba58c9e975d8298e7370494b845694ee8a6882d0d6ed37`) in `ids-input/fonts/`.
  This subset SHA-256 `55130593e905c758e1c74b390ac50743eea347dad1b714a9af10993faf3facae`.
- `specimen-tw-kai.woff2` (1,660 bytes, 永 U+6C38): TW-Kai, 數位發展部 (Ministry of Digital
  Affairs), CNS11643中文標準交換碼全字庫, fonts version 11510.1, from
  [the CNS 11643 open data](https://www.cns11643.gov.tw/opendata/Fonts_Kai.zip), under the Open
  Government Data License 1.0 (`../third-party/ids-input/fonts/LICENSE-OGL.txt`,
  <https://data.gov.tw/license>). Cut from `TWKai-Regular.woff2` (SHA-256
  `a693bce3c087cf40dfd077cabada68652740e651944d423ffdc14b9d3a03f4b9`) in `ids-input/fonts/`. This
  subset SHA-256 `f49ca3137400575391516b597d716b71eb361bdff77a19cf768288412798e9fc`.
- `specimen-kureedo.woff2` (1,228 bytes, 永 U+6C38): Kureedo v0.4.3, Copyright The Klee Project
  Authors, SIL Open Font License 1.1 (`../third-party/ids-input/fonts/OFL-Kureedo.txt`). Cut from
  `Kureedo-Regular.woff2` (SHA-256
  `678769b18123201d292436e854121de9b636162ca595e5e9fb71684636ead430`) in `ids-input/fonts/`.
  This subset SHA-256 `2bab6831f8726c8200034de5515aee7e44b7551ba795931755f22dc29e6541ef`.

Rebuild all three with fonttools:

```sh
uv run --with 'fonttools[woff]' pyftsubset ZhuqueFangsong-Regular.woff2 --unicodes='U+6C38' --flavor=woff2 --name-IDs='*' --name-languages='*' --output-file=specimen-zhuque.woff2
uv run --with 'fonttools[woff]' pyftsubset Kureedo-Regular.woff2 --unicodes='U+6C38' --flavor=woff2 --name-IDs='*' --name-languages='*' --output-file=specimen-kureedo.woff2
uv run --with 'fonttools[woff]' pyftsubset TWKai-Regular.woff2 --unicodes='U+6C38' --flavor=woff2 --name-IDs='*' --name-languages='*' --output-file=specimen-tw-kai.woff2
```

The names and licences of the full faces are recorded in `../third-party/ids-input/fonts/README.md`.

## Social card face

`social-card.otf` and `social-card-hangul.otf` are subsets of the Traditional Chinese and Korean faces
from Noto Sans CJK 2.004. The Worker loads the Korean subset when a card contains Hangul. Both fonts
are under the [SIL Open Font License 1.1](../third-party/ids-input/fonts/OFL-NotoSansCJK.txt).

```sh
uv run --with fonttools pyftsubset NotoSansCJK-Regular.ttc --font-number=3 \
  --output-file=social-card.otf --unicodes='U+20-052F,U+1E00-1EFF,U+2000-206F,U+2E80-9FFF,U+F900-FAFF,U+FF00-FFEF' \
  --no-hinting --no-layout-closure --layout-features=kern
uv run --with fonttools pyftsubset NotoSansCJK-Regular.ttc --font-number=1 \
  --output-file=social-card-hangul.otf --unicodes='U+1100-11FF,U+3130-318F,U+AC00-D7FF' \
  --no-hinting --no-layout-closure --layout-features=kern
```
