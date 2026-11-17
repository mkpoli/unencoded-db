# Glyph style specimens

Two one-glyph subsets let the glyph style switch draw its specimen 永 in the Fangsong and Kaisho
faces without loading their full exports.

- `specimen-zhuque.woff2` (1,064 bytes, 永 U+6C38): Zhuque Fangsong v0.212 by TrionesType,
  Copyright 2023 JadeFoci, SIL Open Font License 1.1 (`../third-party/ids-input/fonts/OFL-Zhuque.txt`).
  Cut from `ZhuqueFangsong-Regular.woff2` (SHA-256
  `5cb9aca8a85825a204ba58c9e975d8298e7370494b845694ee8a6882d0d6ed37`) in `ids-input/fonts/`.
  This subset SHA-256 `55130593e905c758e1c74b390ac50743eea347dad1b714a9af10993faf3facae`.
- `specimen-kureedo.woff2` (1,228 bytes, 永 U+6C38): Kureedo v0.4.3, Copyright The Klee Project
  Authors, SIL Open Font License 1.1 (`../third-party/ids-input/fonts/OFL-Kureedo.txt`). Cut from
  `Kureedo-Regular.woff2` (SHA-256
  `678769b18123201d292436e854121de9b636162ca595e5e9fb71684636ead430`) in `ids-input/fonts/`.
  This subset SHA-256 `2bab6831f8726c8200034de5515aee7e44b7551ba795931755f22dc29e6541ef`.

Rebuild both with fonttools:

```sh
uv run --with 'fonttools[woff]' pyftsubset ZhuqueFangsong-Regular.woff2 --unicodes='U+6C38' --flavor=woff2 --name-IDs='*' --name-languages='*' --output-file=specimen-zhuque.woff2
uv run --with 'fonttools[woff]' pyftsubset Kureedo-Regular.woff2 --unicodes='U+6C38' --flavor=woff2 --name-IDs='*' --name-languages='*' --output-file=specimen-kureedo.woff2
```

The names and licences of the full faces are recorded in `../third-party/ids-input/fonts/README.md`.
