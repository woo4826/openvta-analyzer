# Map-first Lap Workbench Interaction Design

## Goal

Turn the Segment Analysis Workbench into a map-first, full-browser comparison
surface. Lap paths must remain distinguishable when they overlap, operators
must be able to edit each map layer without changing chart/table filtering, and
the shared chart/map cursor must follow ordinary pointer movement continuously.

The supplied local VTA file is the acceptance fixture. It stays outside Git and
all analysis continues to run client-side.

## Confirmed root causes

1. The comparison map renders the focused/reference lap paths on top of a track
   centerline, every colored track section, the selected-segment highlight, and
   a focused-lap loss-rate heat layer. The colored underlay looks like more lap
   paths even when only two comparison overlays exist.
2. The SVG fallback honors `dashArray`, but the MapLibre `lap-overlays` layer
   ignores it. All production map paths therefore render solid.
3. The telemetry cursor subscribes to ECharts series `mouseover`. That event is
   sparse and only fires while the pointer hits a rendered series graphic; it
   does not track movement across the chart plotting area.
4. The persisted v1 dashboard layout keeps the map and telemetry at six columns
   each, so changing only the default layout cannot enlarge existing users'
   maps.
5. The time-loss ranking and graph mode toolbar duplicate the section controls
   and chart navigation while consuming the most valuable comparison space.

## Chosen experience

### Full-width map-first layout

- The workbench uses the full available browser width instead of the current
  1680 px application cap.
- On desktop and tablet grid breakpoints the map is the first, full-width
  widget. It receives a taller default row allocation and a minimum visual
  height based on the viewport.
- Telemetry is the next full-width widget. Evidence and variation follow, with
  the lap table last.
- A v2 presentation preference key deliberately resets the old six-column
  dashboard arrangement while preserving the zero-backend storage model.

### Comparison-only map geometry

- The lap workbench stops drawing the colored track-section underlay and the
  loss-rate heat layer. The track centerline remains only as a thin neutral,
  low-opacity guide.
- Section selection remains available in the analysis drawer and range
  navigator. The map is reserved for spatial lap comparison and the active
  selected-range highlight.
- Lap overlay widths become thin enough to show lateral separation: focused
  4 px, reference 3.5 px, other laps 2.5 px.

### Per-lap layer editor

Every analysis record with at least two trajectory points receives a
deterministic automatic map style:

- focused lap: red, solid, 100% opacity, visible;
- reference lap: blue, dashed, 90% opacity, visible;
- other laps: stable palette color, alternating dashed/dotted style, 48–62%
  opacity, hidden initially.

An in-map `Lap layers` control opens a compact panel. Each lap row contains:

- visibility checkbox;
- role/ordinal label;
- color input;
- solid/dashed/dotted selector;
- opacity slider.

`Show comparison`, `Show all`, and `Auto styles` provide fast recovery. Layer
overrides are recording-session UI state: they remain while the recording is
open and are discarded when the record set changes. This avoids leaking stale
lap IDs between local files.

MapLibre uses three filtered layers (`solid`, `dashed`, `dotted`) over one
GeoJSON source. Each filtered layer has a constant supported
`line-dasharray`, while color, width, and opacity remain data-driven. The SVG
fallback keeps the exact dash array.

### Continuous shared cursor

`ChartPanel` listens to ZRender `mousemove`, not ECharts series hover. On each
animation frame it:

1. checks that the pointer is inside a chart grid;
2. converts the pointer pixel to x-axis domain with `convertFromPixel`;
3. immediately draws the local vertical cursor;
4. emits the domain value to `SegmentTelemetryChart`.

The telemetry component resolves that domain value to the nearest focused-lap
trajectory sample and updates the workbench-owned distance/source-index cursor.
The map selected point and focused/reference ghost markers therefore follow the
same pointer without requiring the user to hit a narrow series line.

### Telemetry simplification

- The chart always renders speed, measured device acceleration, and Delta-T.
- Remove the Select range, Zoom, Detailed channels, and Reset toolbar.
- Remove the duplicate keyboard range form. Range/section selection remains in
  the dedicated analysis controls.
- Keep the compact cursor readout and native linked data-zoom slider.
- Shorten the widget/title copy to `Lap telemetry` / `랩 텔레메트리`.

### Remove time-loss ranking

Remove the `opportunities` widget ID, dashboard layout entries, preference
switch, hook calculation, production component, pure opportunity builder, and
their dedicated tests/types. Historical documentation can remain historical,
but no runtime workbench path or visible copy may expose `Biggest time-loss
sections` / `Time-loss ranking`.

## Testing and acceptance

- Pure layer-style tests prove deterministic defaults, role styles, other-lap
  visibility, and immutable overrides.
- Map component tests prove all eligible laps reach RouteMap, controls update
  visibility/color/style/opacity, and comparison geometry no longer supplies
  colored sections or heat layers.
- RouteMap tests prove MapLibre creates solid/dashed/dotted lap layers and SVG
  fallback receives dash arrays.
- ChartPanel tests simulate ZRender movement away from a series and prove a
  domain callback and immediate cursor render.
- Telemetry tests prove the four toolbar buttons and keyboard range form are
  absent while the three core metric bands remain.
- Preference/dashboard tests prove the v2 full-width map-first layout and the
  absence of the opportunity widget.
- Full typecheck, lint, unit tests, build, and repository E2E suite pass.
- Aside loads `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`, verifies
  the map at roughly twice the former horizontal area, edits a non-role lap
  layer, and samples pointer positions across the chart to prove the distance
  readout advances continuously.
- GitHub Pages serves the pushed commit and repeats the production smoke test.

