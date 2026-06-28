# OpenVTA Analyzer

OpenVTA Analyzer is a zero-backend Web/PWA workspace for VTA trajectory files. It parses `.Vta` and `.zip` session exports locally in the browser, visualizes route and sensor data, supports segment export, and includes calibration and low-pass filtering tools.

## Features

- Modern OpenVTA, legacy phone, and standalone IMU box VTA parsing.
- `.zip` import for sessions containing `.Vta` files.
- Speed-colored route view with OpenStreetMap-compatible interactive tiles and a coordinate fallback.
- Workspace file tray with active file selection, parse health, source counts, warnings, and remove-file controls.
- Raw GPS and enhanced GPS source toggles, point-size controls, speed color thresholds, map-driven segment selection, and route fit/reset tools.
- Velocity, altitude, accuracy, acceleration, velocity+acceleration, orientation, friction-circle, and validation charts.
- GPS, enhanced GPS, sensor, warning, summary, and validation table inspection with sorting and visible-row export.
- CAL-file, session, static-window, or manual calibration offset estimation.
- Named calibration presets with JSON import/export.
- 2nd-order low-pass Butterworth filtering for acceleration channels.
- Segment `.Vta`, transformed segment `.Vta`, GPS CSV, sensor CSV, validation CSV, and summary JSON export.
- Client-side only: traces are not uploaded by the app.

## Legacy VTA_Road parity scope

OpenVTA Analyzer targets the practical analysis workflows from the legacy VTA_Road Windows program, not a pixel-for-pixel rewrite. The supported parity scope is:

- Load one or more VTA files, including ZIP session bundles that contain VTA files.
- Inspect speed-colored trajectories with raw/enhanced source controls.
- Review velocity, acceleration, orientation, accuracy, altitude, friction-circle, and validation views.
- Select a point or route segment from map, chart, or numeric controls.
- Summarize the selected file or segment with distance, duration, speed, altitude, sensor count, and warning count.
- Calibrate acceleration data from CAL files, the active session, a static window, or manual offsets.
- Apply optional low-pass filtering while keeping the original parsed data available.
- Export selected segments and analysis tables for downstream review.

The app remains a browser analyzer for public GitHub Pages deployment. There is no server, account system, database, telemetry pipeline, or hosted file storage.

## Not CAD

The legacy Windows app included CAD-engine menus for drawing, editing, layers, blocks, raster insertion, object snapping, printing, plugins, and ECW backgrounds. OpenVTA Analyzer intentionally does not implement general CAD editing.

Analysis-adjacent map tools are in scope: route display, source toggles, speed styling, segment selection, simple region/measurement summaries, and exportable analysis data. CAD drafting, project drawings, object editing, proprietary raster workflows, and CAD plugin compatibility are out of scope.

## Supported formats

Supported inputs:

- `.Vta` files from modern OpenVTA traces.
- Legacy phone `.Vta` files.
- Standalone IMU box `.Vta` files.
- `CAL*.Vta` calibration files.
- `.zip` archives containing one or more `.Vta` files.

Supported exports:

- Original selected segment `.Vta`.
- Transformed selected segment `.Vta` with generated metadata headers for calibration/filtering provenance.
- GPS CSV.
- Sensor CSV.
- Validation CSV.
- Summary JSON.
- Visible table CSV from the active table tab.

Export line endings can be LF or CRLF. Use CRLF when a downstream Windows tool expects Windows-style text files.

Deferred or unsupported imports:

- RT-3000 imports.
- Vericom VC4000 imports.
- Smarty BX-1000 imports.
- Proprietary ECW backgrounds.
- Road Condition Monitoring (RCM) files and calculations.

These are deferred because the public source material does not provide enough stable browser-ready format documentation, sample data, formulas, or licensing clarity to implement them responsibly.

## User workflow

1. Open the GitHub Pages app or run it locally. Drop a `.Vta` file or a `.zip` session onto the loader, or use the bundled sample data.
2. Choose the active file from the file tray. Check the detected format, row counts, parse warnings, and summary metrics before analysis.
3. Choose map sources. Toggle raw GPS and enhanced GPS, adjust point size or speed thresholds, and use the coordinate fallback if interactive tiles are unavailable.
4. Select a segment. Pick start/end points on the map, brush the velocity chart, or enter numeric point indexes in the export panel.
5. Use charts and tables together. Hover or select chart points to inspect the same route area, review velocity/acceleration summaries, and sort/export visible rows from the tables.
6. Calibrate and filter when needed. Estimate offsets from a CAL file, the current session, a static window, or manual values; save reusable presets; then preview raw, calibrated, filtered, or comparison modes.
7. Export the result. Choose LF or CRLF line endings, then download the original segment, transformed segment, GPS CSV, sensor CSV, validation CSV, visible table CSV, or summary JSON.

## Development

```bash
pnpm install
pnpm dev
```

Verification:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Deployment

The app is designed for GitHub Pages. The `Deploy Pages` workflow builds `dist/` on `main` and publishes it through GitHub Pages. Keep the repository public to preserve zero-cost Pages and Actions usage.

## Privacy

Files are opened through browser APIs and parsed in memory. The app does not send GPS traces, sensor rows, calibration files, or exports to a server. Map tiles are requested only for the visible interactive map viewport.

Interactive tiles are loaded from the configured tile URL, which defaults to OpenStreetMap-compatible tiles. Tile providers can see normal map tile requests for the visible viewport, such as tile coordinates, IP address, user agent, and request time. The VTA file contents, sensor rows, calibration values, selected segment, and exports are not sent to the tile provider by the app.

If tile privacy is more important than the interactive basemap, use the coordinate fallback by blocking tile requests or configuring a trusted/internal tile endpoint in the app settings. Offline tile packs are not bundled.

Calibration presets are stored only in browser local storage under the key `openvta.calibrationPresets.v1`. Presets contain the saved name, timestamp, offsets, unit, sample count, and source metadata needed to reapply the calibration. They are not synchronized across browsers or devices unless you export and import the presets JSON yourself. Invalid or incompatible preset JSON is ignored instead of preventing the app from loading.

## Scope

Included: practical legacy VTA_Road analysis parity for VTA loading, map review, linked charts, tables, calibration, filtering, segment extraction, and export in a zero-backend PWA.

Deferred: CAD editing tools, RT-3000/Vericom/Smarty imports, proprietary ECW backgrounds, offline tile packs, and Road Condition Monitoring calculations.
