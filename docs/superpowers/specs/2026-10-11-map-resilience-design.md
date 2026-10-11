# Map interaction resilience

Approved by the user on 2026-10-11: preserve the current MapLibre renderer,
fix map failures, optimize source updates, test the supplied VTA locally, and
deploy only the public GitHub Pages analyzer.

## Evidence

The supplied recording parses as 1,589 GPS points and 158,289 sensor rows.
Twelve ordinary wheel interactions did not reproduce a freeze. A controlled
503 response injected into raster tile fetches did: the error handler removed
the canvas and replaced it with a non-zoomable SVG. Restoring networking and
using Fit route did not restore the map. This reproduces one confirmed failure
path; it does not establish that every reported freeze has this cause.

## Design

- Treat errors from the `osm` raster source as recoverable. Keep the map,
  geometry, viewport, and selection handlers alive. Show a localized notice
  with an explicit retry action. Clear the notice after successful tile data.
- Keep coordinate fallback for map construction and non-raster fatal errors.
- Initialize geometry at `style.load`, independently of pending raster tiles.
  Do not discard geometry/cursor updates simply because tiles are loading.
- Update GeoJSON sources only when their content changes. Cache serialized
  payloads per map, not globally across map lifetimes. Retain current schemas,
  source indices, styles, and selection semantics.
- Keep the existing zero-backend model. The recording stays local and is not
  committed, uploaded, or included in the deployed site.

## Acceptance

Regression tests reproduce the old tile-error removal, pending-tile update
loss, and redundant static-source writes before their respective fixes.
Typecheck, lint, full unit tests, and production build pass. Aside verifies
the supplied VTA with repeated zoom/pan, selection, tile failure, recovery,
and tab changes, including the deployed Pages build. Existing GitHub CI must
pass before merging. No OpenVTA Live/custom-server/Android changes.
