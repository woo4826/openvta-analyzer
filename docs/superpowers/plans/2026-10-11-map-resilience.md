# Map resilience implementation plan

> **For agentic workers:** Execute inline with executing-plans; no delegated work is required. Steps use checkbox tracking.

**Goal:** Keep analyzer map navigation usable through raster outages, avoid unnecessary GeoJSON worker updates, and deploy the verified fix to GitHub Pages.

**Architecture:** Separate raster availability from renderer availability. Set up local data at stylesheet readiness, cache source content per renderer, and retain existing selection/fallback contracts.

**Tech Stack:** React, TypeScript, MapLibre GL 4, Vitest, Vite, Aside, GitHub Actions/Pages.

---

## Task 1: Regression tests

Files: `src/components/__tests__/RouteMapSources.test.tsx`.

- [ ] Add tests firing `map.globalHandlers.get("error")?.({ sourceId: "osm", error: new Error("503") })`, asserting `map.remove` is not called and the map container stays mounted. Include retry and successful `sourcedata` recovery.
- [ ] Make mock stylesheet readiness configurable, fire `style.load` before raster readiness, and assert route/cursor data reaches sources while `isStyleLoaded()` is false.
- [ ] Change only ghost positions and assert `route-line-source`, `route-points-source`, and lap data receive no new `setData` calls. Assert changed ghost data does update.
- [ ] Run `pnpm test -- src/components/__tests__/RouteMapSources.test.tsx`; verify these fail against the unchanged implementation.

## Task 2: Fix and optimization

Files: `src/components/RouteMap.tsx`, `src/styles.css`, `src/i18n/locales.ts`.

- [ ] Branch raster errors with `if (event.sourceId === "osm") { setTilesUnavailable(true); return; }` before the existing fatal fallback.
- [ ] Listen to `style.load` for geometry readiness and to `sourcedata` for successful `osm` tile data. Keep source updates independent of raster loading.
- [ ] Retry by removing only the `osm` raster layer/source and recreating it below the first local overlay. MapLibre 4 `setTiles()` does not reload errored tiles, so source recreation is necessary for same-viewport recovery. Add a localized status notice and retry button without blocking navigation.
- [ ] Cache `JSON.stringify(data)` per map/source using a `WeakMap`, call `setData` only when content changes, and reset cached entries when a source is newly created.
- [ ] Run regression tests, then `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.

## Task 3: Browser verification and deployment

Files: `docs/project-handoff/2026-10-11-map-resilience-verification.md`.

- [ ] Run local Vite at loopback. In Aside load the supplied recording, exercise repeated zoom/pan, cursor selection, route fit and tab remounts. Inject recoverable tile failures into fetch, restore fetch, retry, and confirm live canvas/geometry remain usable.
- [ ] Document actual measured results and limits, without raw location data. Review `git diff --check` and scoped diff.
- [ ] Commit the scoped fix, push the fix branch, create and attach a PR, and wait for existing CI checks to pass. Merge to main, wait for Pages deployment success, and repeat the core checks on the public URL.
- [ ] Report the deployed URL, confirmed cause, verification results, and any remaining limitations.
