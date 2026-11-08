# Design system

The Rare Character Compendium uses one small design system for every public page. It follows the
Glyph Atlas interface: the same neutral surfaces, violet accent, status colours, focus ring and
type-led layout. The palette and control shapes are taken from
[`apps/review/src/app.css`](https://github.com/mkpoli/glyph-atlas/blob/798db03e/apps/review/src/app.css)
in Glyph Atlas, which has no separately packaged design system. This repository keeps the shared
part in `src/lib/design/` so a future package can be extracted without changing the pages.

## Files

| File | Contents |
| --- | --- |
| `src/lib/design/tokens.css` | Colour pairs, type scale, spacing and radii. |
| `src/lib/design/base.css` | Resets, headings, links, focus rings, inputs and button variants. |
| `src/lib/design/components.css` | Header, footer, collection cards, record layout, form panels, file field and language menu. |
| `src/lib/components/FileField.svelte` | Accessible image picker with preview, replace and remove. |

`src/style.css` imports the three files in that order. A page adds classes from the system; it does
not define new colours or control styles.

## Tokens

Colours are `light-dark()` pairs, so one declaration serves both schemes and `color-scheme` follows
the reader. `data-theme="light"` or `data-theme="dark"` can pin a scheme.

| Group | Tokens |
| --- | --- |
| Surfaces | `--paper`, `--surface`, `--surface-sunken`, `--surface-subtle`, `--surface-tile`, `--surface-selected`, `--surface-disabled` |
| Ink | `--ink`, `--muted`, `--faint` |
| Rules | `--line`, `--line-strong`, `--line-hover` |
| Accent | `--accent`, `--accent-solid`, `--accent-solid-hover`, `--accent-light`, `--accent-hover`, `--accent-tile`, `--focus-ring`, `--on-color` |
| Status | `--wrong`, `--wrong-light`, `--good` |
| Elevation | `--shadow`, `--shadow-soft`, `--shadow-menu` |
| Type | `--font-ui`, `--font-mono`, `--text-xs` to `--text-3xl` |
| Layout | `--space-1` to `--space-12`, `--radius-xs` to `--radius-lg`, `--content-max`, `--form-max`, `--gutter` |

Text uses Inter with a CJK face chosen by the document language: Noto Sans CJK JP for Japanese, SC for
Simplified Chinese, TC for Traditional Chinese and KR for Korean. Monospace is reserved for record
ids, the language eyebrow and section labels. The light `--muted` is a shade darker than Glyph Atlas so 14 px muted
text keeps a 4.5:1 contrast on the paper.

## Rules

- One primary action per view: `.primary`, a solid violet button. `.secondary` is a bordered
  surface button; `.quiet-link` is an underlined text action.
- Inputs are 42 px high with a 6 px radius and a 1 px rule. Focus is a violet border plus a 3 px
  `--accent-light` ring. Errors use `--wrong` on the border and text, never colour alone: the
  message is always present and tied to the input with `aria-describedby`.
- Page headings use h1 at 34 px; section labels are 10 px uppercase monospace. Body copy is 14 px.
- The content column is 1200 px; forms are 720 px. Mobile collapses the header nav onto its own
  row, forms to one column and record rows to a stack.
- The file field is a whole clickable surface. Empty: an icon, the action, the accepted formats and
  a browse button. Chosen: a thumbnail, name, size, replace and remove. Drag and drop sets the same
  native input. The hidden input keeps the native picker, keyboard access and form submission.
- Every interactive target is at least 40 px high on desktop and 44 px on the primary action.
- Status is never conveyed by colour alone; error copy and labels carry it.

## Adding a page

Reuse `.site-main`, `.page-heading`, `.form-panel`, `.field`, `.primary` and `.secondary`. A new
control belongs in `base.css` if it is an element pattern, and in `components.css` if it composes
several elements. Change colour in Glyph Atlas first, then port the token values here so the two
sites stay aligned.
