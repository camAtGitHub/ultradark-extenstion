# Agent Guide
## Project Description
This repository is a browser extension built with TypeScript and Vite. Key areas:

- **Popup UI**: `src/popup/` controls the popup sliders and toggles. The popup sends `udr:settings-updated` messages to the active tab.
- **Content scripts**: `src/content/` contains algorithms and the main entry (`index.ts`) that reads settings and applies the selected algorithm.
- **Algorithms**: Photon inverter (`src/content/algorithms/photon-inverter.ts`), DOM walker (`src/content/algorithms/dom-walker.ts`), and Chroma semantic (`src/content/algorithms/chroma-semantic.ts`).
- **Shared CSS builder**: `src/content/style-template.ts` builds the injected CSS using brightness/contrast/etc.

## Code style
<TODO>

## Naming Conventions
<TODO>

## Rules:
- Don't break existing functionality!
- After finishing a bug fix / completing an github issue, ensure all linting and tests pass.

## Useful commands:
- Run tests: `npm test`
- Run lint: `npm run lint`
- Build extension: `npm run build`

## Notes from initial exploration:
- No existing `AGENTS.md` files; this file applies repo-wide.
- Tests and lint already set up in `package.json`.
- Settings changes propagate through `udr:settings-updated` messages handled in `src/content/index.ts`.
