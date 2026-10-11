# Map interaction resilience verification — 2026-10-11

## Scope and diagnosis

Public GitHub Pages analyzer only. No Live/server/Android changes. Raw VTA
stays local and is not included in this commit or the deployed artifacts.

The user-supplied recording contains 1,589 GPS points and 158,289 sensor rows.
On the previously deployed build, 12 ordinary wheel gestures did not freeze
the map. Injecting 503 responses into raster fetches while zooming removed
the canvas and displayed the static coordinate plot. Restoring fetch and
using Fit route left zero map canvases. This is a confirmed reproducible
failure path, not proof that every browser/GPU freeze has this cause.

## Fix and optimization

- Raster errors preserve the live map, viewport and local geometry. A
  localized status notice offers explicit retry; successful tile data clears it.
- Geometry and selection are initialized on `style.load`, not delayed by
  raster completeness. A per-instance readiness ref prevents stale ready
  state from writing sources into a newly constructed, unready map.
- Ghost markers update separately from static route/lap layers. Equal
  GeoJSON payloads are not resent to workers. The cache is weakly owned per
  map and validates source identity before skipping updates.
- Retry recreates only the raster source/layer below the local overlays.
  Installed MapLibre 4 source code confirms that `setTiles`/reload excludes
  errored tiles. In the browser, that first retry approach retried zero of
  35 failed URLs. The corrected implementation retried 9 previously failed
  URLs at the unchanged viewport and cleared the notice. No zoom/pan was
  performed between failure and retry.

## Verification

- Regression red/green: three new tests failed on the original implementation
  (raster removal, missing updates during raster loading, redundant static
  writes). The strengthened retry regression failed on the first `setTiles`
  implementation before the source-recreation fix.
- Final local checks: typecheck, lint, production Pages-base build pass.
  Unit suite: 60 files / 342 tests pass; focused map suite: 22 tests pass.
  Unit test worker concurrency was limited to two.
- Aside, production build at `/openvta-analyzer/`, actual supplied recording:
  overview zoom in/out 24 actions; lap comparison zoom in/out 24 actions;
  pan, focused-lap change, section change, chart cursor movement, overview
  remount, controlled 503, offline selection, retry, network recovery.
  Live canvas remains mounted, rendering responds, and no page exceptions
  were recorded. No standalone Playwright browser automation was used.
- Dedicated code review identified the retry limitation; after its correction,
  reviewer reported no remaining critical/important findings.

## Limits

One desktop Chromium-family browser was exercised via Aside. This does not
claim universal browser/GPU coverage or guarantee third-party tile uptime.
Fatal non-raster errors and renderer-construction failure retain the existing
coordinate fallback. No data schemas, exports, dependencies or workflow
definitions were changed. GitHub CI and public deployment are verified as
the next delivery step; their run identifiers belong in the final handoff.
