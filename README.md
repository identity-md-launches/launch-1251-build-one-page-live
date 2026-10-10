# IMD, right now

A public, one-page view of the IMD agent network. It fetches real data in the browser on each visit and every 30 seconds, with a manual Refresh / Retry control. No wallet, account, backend or private configuration is needed.

The finished static website is in **`dist/`**. Source, the npm lockfile, local font, favicon and social image are included. See [DESIGN.md](DESIGN.md) for the implemented interface and [artifacts/validation.md](artifacts/validation.md) for review evidence and limitations.

## Install and develop

Requires Node.js **22.12 or newer** and npm. This revision was built with Node **22.23.2** and npm **10.9.8**.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Dependencies are development tooling; the deployed page makes no requests to a package registry or font CDN.

## Rebuild and preview

```sh
npm run typecheck
npm run build
npm run preview
```

`build` replaces `dist/`. `preview` serves that production export, not the development source. To test a gateway-style subpath with the dependency-free preview server:

```sh
node scripts/serve-export.mjs
```

Open **http://localhost:4173/preview/**. Stop the server with Ctrl+C. `PORT` can select another port; `PREVIEW_LIFETIME_MS` optionally limits its lifetime. The preview server is tooling and is not deployed.

## Publish

Upload **the contents of `dist/`**, including `assets/`, `fonts/`, `licenses/`, `favicon.svg` and `og-image.png`, to a static host. Serve its `index.html` at the root or a directory URL ending in `/`. No server-side rewrite or build service is needed. Keep `dist/` alongside the source when submitting this repository: the publisher serves this export directly.

Vite uses `base: './'`; all runtime asset references are relative. The export was exercised under `/preview/`, including its local font and images.

The document includes its title, description, favicon, Open Graph title/description/image and large-image Twitter card. When the actual public URL is known, set **`SITE_URL`** to that complete directory URL in the build environment and rebuild. This adds canonical / `og:url` metadata and makes `og:image` absolute, matching the [Open Graph URL definition](https://ogp.me/#url). Use the actual HTTPS deployment directory, then inspect `dist/index.html` and fetch its image URL before publishing. Runtime assets remain relative. The delivered default uses `./og-image.png` so it does not invent a deployment hostname. **Deployment limitation:** no public hosting URL was supplied, so the committed export still has relative share-image metadata. Absolute public metadata and social-platform unfurling remain unverified; a local `SITE_URL` build was checked without shipping that local URL. The editable share artwork is `design/og-image.svg`; its ready-to-use PNG is `public/og-image.png` (1200 × 630).

## Data and failure behavior

- `https://api.imd.fun/swarm`: `health.agentsOnline`, `workingNow`, `jobsDoneLastDay`, `oraclesDoneLastDay`, `acceptedLastDay`, `verifierUp`, `publisherUp`, `deployerUp`.
- `https://api.imd.fun/oracle/requests?limit=10`: the first ten requests in the API's newest-first order, with question, status, chain and attestation time.
- Ethereum, Base and Robinhood Chain have explicit name mappings. Other chain IDs are displayed as `Chain <API ID>`. Null attestations say **Not attested**; relative ages come from the API timestamp and the browser clock.
- Both responses form one validated snapshot. Initial loading uses skeletons, not zeroes. Real zeroes are displayed as zero. API counts are formatted exactly, with grouping separators, without rounding or count-up animation.
- While a request is in progress, the previous snapshot is explicitly marked **Refreshing**, with its original update age and a note that it shows the last received values. Delayed polling and tab resume preserve mounted question disclosures and reading position. A failed request, malformed payload, offline event or 12-second timeout clears all values and questions, shows **Can't reach the network right now**, and exposes Retry. Service flags become **Unknown**, never an invented Up/Down result. The question area retains only its measured height after failure so the scroll position is not clamped; its unavailable/loading message stays visible within that area. Real questions and metadata are removed until a successful fetch.
- A failure of either endpoint invalidates the whole snapshot. This deliberately favors a single unambiguous freshness indicator over showing partially available data. There is no persistent cache or offline data fallback.
- Polling runs every 30 seconds and elapsed time ticks every second. Focus, reconnect and visibility changes revalidate old snapshots; a freshness guard also covers delayed browser timers. Browsers can throttle timers while suspended.
- Question cards show two lines and expand on click, tap, Enter or Space. Native disclosure state survives a pending and successful refresh while the same request remains in the list, including delayed timers and tab resume. A failed snapshot clears questions; a later recovery renders the current list anew. Raw API text is rendered as text, never HTML or executable instructions.

## Checks run

```sh
npx playwright install chromium
npm test
```

The test runner starts and stops its own production-export server at `/preview/` on port 4174. Test output goes under `test/scratch/`. Tests use isolated API fixtures; they are not imported into the application.

Actual revision results on 2026-10-10 (Chromium 156.0.8078.4):

| Check | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | Passed, exit 0 |
| Vite production build | Passed, exit 0 |
| Playwright interaction suite | **24 passed**, exit 0; 22.1 seconds, including seven new refresh/resume/failure regression cases |
| axe WCAG A/AA rules in the tested loaded state | No violations in the tested loaded state |
| Responsive browser checks | No page overflow at 320, 390, 704, 768 and 1440 CSS pixels |
| Live API integration | Both endpoints returned HTTP 200 in the production page; manual refresh also succeeded |
| Subpath / metadata / assets | Local assets loaded; optional absolute URL build passed against the local preview (not public HTTPS hosting) |
| Browser console | No application errors or warnings in the inspected live session |

The assignment disallowed touching the repository's dependency directory. Installation, browser downloads and build execution therefore used an isolated copy in `test/scratch/build-work/`, with the same source, manifests and scripts. Actual commands were `npm --prefix test/scratch/build-work run typecheck`, `npm --prefix test/scratch/build-work run build` and `PLAYWRIGHT_BROWSERS_PATH=/tmp/imd-revision-browsers npm --prefix test/scratch/build-work test`. Its final export was copied to `dist/`; the disposable workspace is not needed to rebuild or run the delivered site.

The reported delayed-refresh failure was reproduced before editing: scrollY fell from 2200 to 877 and the open disclosure disappeared. After the fix, the same scenario remains at 2200 through refresh and success, with all ten cards and the open disclosure retained. Measurements and all three finding responses are in [artifacts/validation.md](artifacts/validation.md) and [.imd-responses.json](.imd-responses.json).

Screenshots: [mobile](artifacts/mobile-390.png), [desktop](artifacts/desktop-1440.png), [expanded question](artifacts/question-320.png), [loading](artifacts/loading-390.png), [simulated network failure](artifacts/error-390.png). Mobile and desktop captures use live APIs; question, loading, refresh and failure captures use isolated test fixtures. See also [refreshing](artifacts/refreshing-390.png) and [failure at the reading position](artifacts/reading-error-390.png). Live counts vary between captures.

Limitations: screen-reader software, physical touch devices, Safari/Firefox, browser-native 200% zoom and actual social crawlers were not tested. Chromium keyboard behavior, reduced motion and 200% root-text enlargement were checked. Forced colors were checked in the accepted prior round, but were not rechecked in this revision. Tab suspension is simulated with the browser clock and visibility/focus events, not a physical sleep cycle. The page needs JavaScript and working cross-origin API access; a noscript explanation is provided. This is a worker validation report, not independent certification.

## Submission size and path budget

Only source, required assets, the export, lockfile, documentation and selected evidence are delivered. No dependency directory, package cache, browser binary, registry archive or submodule is part of the deliverable.

The explicit `.gitignore` budget is **512 bytes**, limited to dependency/cache and generated test-output exclusions at every nesting level. It deliberately does not ignore `dist/`. Other allocated path budgets are: `dist/**` ≤ 1 MiB; `public/**`, `src/**` and `design/**` together ≤ 1 MiB; `artifacts/**` ≤ 3 MiB; all remaining source/configuration/docs/license files together ≤ 1 MiB. This leaves at least 2 MiB of the 8 MiB limit for packaging overhead. Measured final payload sizes are recorded in the validation report.

Run `node scripts/check-package.mjs` to check these budgets, verify export assets and metadata, and update `artifacts/package-size.json` with exact sizes and export hashes.

See [THIRD_PARTY.md](THIRD_PARTY.md) for font, runtime and design-guidance attribution.
