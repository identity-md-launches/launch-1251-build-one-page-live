# Implemented design

## Overview

“IMD, right now” is a public status page for people checking whether the agent network is active. Its order is live counts, recent output, service availability, then individual oracle requests. Refresh is the primary action; question disclosure is the secondary interaction. A short product explanation sits above the counts without a marketing hero.

The interface is dark, flat and quiet: charcoal surfaces, warm off-white type, a peach action, and text-labeled status colors. All decisions below describe the final source in `src/styles.css` and `src/App.tsx`. There is one page and no theme switch.

## Colors

Hex sRGB primitives in `:root` feed semantic CSS variables. Components use the semantic variables. All content backgrounds are opaque, which makes contrast pairs directly measurable.

| Semantic token | Value | Use |
| --- | --- | --- |
| `--color-bg-page` | `#101212` | Document and service panel |
| `--color-bg-surface` | `#171a19` | Metric and question cards |
| `--color-bg-hover` | `#1d2120` | Hovered question summary |
| `--color-bg-skeleton` | `#242927` | Static loading shapes and neutral badges |
| `--color-border` | `#343c38` | Structural dividers and card edges |
| `--color-text-primary` | `#f0f1eb` | Headings, questions and live values |
| `--color-text-secondary` | `#c9d0ca` | Metric and service labels |
| `--color-text-muted` | `#a1aaa4` | Descriptions, timestamps, disclosure hints |
| `--color-text-placeholder` | `#7d8982` | Unavailable-value dashes |
| `--color-accent` | `#ee9865` | Refresh/Retry fill, brand mark and title punctuation |
| `--color-accent-hover`, `--color-focus` | `#ffb183` | Button hover and keyboard focus |
| `--color-on-accent` | `#101212` | Text/icons on peach backgrounds |
| `--color-success`, `--color-success-bg` | `#b4dda0`, `#242e23` | Up, live and completed/attested states |
| `--color-warning`, `--color-warning-bg` | `#e7c884`, `#302a1d` | Pending / disagreed request states |
| `--color-danger`, `--color-danger-bg` | `#f2aba5`, `#332523` | Connection errors, Down and failed requests |

Every status includes a text label. Brand color is not a service-health signal. Success, warning and danger fills are used as badge backgrounds, not competing primary actions.

Measured rendered text/background pairs include primary text on cards **15.43:1**, secondary labels on cards **11.15:1**, muted text on cards **7.35:1**, muted text on the page **7.88:1**, button text **8.34:1**, attested badge **9.26:1** and disagreed badge **8.81:1**. See the validation report for coverage and distinctions between browser observations and source checks.

## Typography

The local variable **Geist** Latin font is `public/fonts/geist-latin.woff2`, loaded via `@font-face` and preloaded by the HTML. It provides upright weights 100–900; this interface requests 400 (body), 500 (numbers/status), 550 (headings/buttons) and 650 (brand). Fallbacks are `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`. Non-Latin question text uses those system fallbacks. The browser confirmed Geist was loaded.

Exactly six size tokens are used at the default 16px root:

| Token | Size | Role |
| --- | --- | --- |
| `--text-caption` | 13px / 0.8125rem | Metadata, descriptions, update age |
| `--text-label` | 14px / 0.875rem | Buttons, compact labels and services |
| `--text-body` | 16px / 1rem | Description, questions, desktop metric labels |
| `--text-section` | 20px / 1.25rem | Section and empty-state headings, brand |
| `--text-title` | 32px / 2rem | Page title and daily metrics |
| `--text-metric` | 56px / 3.5rem | Primary counts |

Body line-height is 1.5; question copy uses 1.6; the title and numbers use 1.2; section headings use 1.35. Heading tracking is −0.04em for the title and −0.025em for sections. Values use −0.04em with tabular figures, as do timers without the negative tracking. There are no tracked uppercase labels.

`Metric` formats the complete API integer with English grouping separators. Long formatted values step down through existing size tokens rather than rounding. Questions clamp to two lines when closed, use `overflow-wrap: anywhere` for URLs/IDs, and expand to at most 75ch. Full text remains selectable. Questions use `dir="auto"` and chain names use `bdi`.

## Layout

The shared `.shell` is capped at **65rem (1040px)**, with 40px horizontal margins until the mobile breakpoint. Main content is an inline-size query container. Grid children use `minmax(0, 1fr)` and `min-inline-size: 0` to prevent content forcing the viewport wider.

Spacing tokens `--space-1` through `--space-7` define **4, 8, 12, 16, 24, 32, 48px**. Card interiors use 24–32px on desktop and 16px on mobile; question rows are separated by 12px. Sections use 32–48px separation. Related label/value/hint content is closer together.

- **Above 960px:** two primary count cards; below them, daily output and service health share a 1.5:1 grid. Both sections contain three columns.
- **At 960px and below (`60rem`):** daily output and service health stack; services use horizontal label/status pairs.
- **At 704px and below (`44rem`):** margins become 20px, the header becomes 72px minimum, its secondary brand caption is hidden, freshness metadata stacks, card padding reduces, and services place each status below its name. The two primary counts remain side by side.
- **At 368px and below (`23rem`):** margins become 16px, daily metrics become three full-width label/value rows, and the decorative questions icon is removed.
- **At a main-container width of `17rem` or less:** the toolbar wraps and all metric/service grids become one column. Because this query is relative to text size, it also handles enlarged text without imposing a fixed content height.

The body has a 320px minimum width; no `overflow-x: hidden` masks problems. At 390 × 844, the title, explanation, Refresh control and both primary values are visible without scrolling. Reflow was checked at 320, 390, 704, 768 and 1440px, plus 200% root-text enlargement. Browser-native zoom is unverified.

## Elevation & Depth

There are no shadows, gradients, floating dashboard layers or image backdrops. Tonal surface differences group content; 1px borders explain card boundaries and internal columns. The sole elevated element is the keyboard-only skip link (`z-index: 10`). Normal content and controls stay in document flow.

## Shapes

`--radius-card` is **12px**, used on metric groups, service panels, questions and empty states. `--radius-control` is **8px**, used on Refresh/Retry and the decorative section icon. Status badges use 6px; status dots use a circular radius. Question summaries inherit their card radius so hover treatment follows the card edge. Card borders are 1px; keyboard focus is a 2px outline with a 5px offset, using the focus token or system `Highlight` in forced-colors mode.

## Components

The component patterns live in `src/App.tsx`; live state is separated into `src/useLiveNetwork.ts`, with API validation and formatting helpers in `src/api.ts`.

- **`Brand`**: local network mark, IMD wordmark and desktop caption. The adjacent About link is an ordinary link.
- **`Metric`**: `label`, optional numeric `value`, optional `description`, `primary` and `unavailable`. It renders semantic `dt`/`dd` groups. Missing data uses a static skeleton with a loading name, or a dash with an unavailable name; it never substitutes zero. Minimum count area height preserves surrounding layout.
- **Refresh/Retry**: one peach native button, at least 44px tall. Its accessible name includes its visible action. While a fetch is active it stays focusable with `aria-disabled`; the request guard prevents duplicate work. The failure state uses Retry.
- **Freshness and connection note**: distinct Live / Refreshing / Connecting / Unavailable states. A stable polite announcement region reports fetch outcomes; the once-per-second age is not a live region. Error text gives the recovery step.
- **`Service`**: native description-list name/status pairs. Explicit booleans produce Up or Down; absent data produces Checking or Unknown. Color and the status dot supplement the word.
- **`QuestionCard`**: native `details`/`summary` disclosure with a status badge, chain name, attestation age, two-line question and Read/Collapse hint. The whole summary is the target. Enter and Space work without custom keyboard handlers. Stable API IDs preserve open state during successful refreshes.
- **`QuestionLoading` / empty states**: static skeleton shapes; distinct no-requests and unavailable copy. A successful empty list invites another refresh and explains that new requests appear automatically.
- **`Icon`**: one inline SVG set with 1.5px strokes and `currentColor`. All icons are decorative and hidden from assistive technology.
- **Footer**: plain context line and an ordinary Explore IMD link.

Motion is limited to 150ms button/surface hover transitions with `cubic-bezier(0.2, 0, 0, 1)` and a 0.96 press scale for the button. All transitions are inside `prefers-reduced-motion: no-preference`. Counts, skeletons and status dots never animate.

## Do's and Don'ts

- Start another surface with `.shell`, native section headings, these size tokens and semantic colors. Match the flat card pattern and shared spacing before introducing a new component.
- Use one filled primary action and native links/disclosures for secondary navigation and reading.
- Keep network values tied to the validated snapshot. Preserve honest loading, refresh and error states when adding a metric.
- Pair every status color with a word. Preserve full question text behind its disclosure and wrap long machine-generated strings.
- Keep assets local. Do not introduce decorative live-looking charts, fake counts, animated numeric transitions or additional font sizes.
- Extend the existing responsive rules and verify any new dense row in loading/error states as well as the successful state.

Design review followed the pinned Better Interface reference; documentation structure followed its adapted Impeccable guidance. Attribution and licenses are in `THIRD_PARTY.md` and `licenses/interface-guidance.txt`.
