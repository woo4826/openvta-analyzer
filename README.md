# OpenVTA Analyzer

OpenVTA Analyzer is a zero-backend Web/PWA workspace for VTA trajectory files. It parses `.Vta` and `.zip` session exports locally in the browser, visualizes route and sensor data, supports segment export, and includes calibration and low-pass filtering tools.

## Project handoff docs

For the current product plan, architecture, deployment workflow, and next-development handoff notes, start with [`docs/project-handoff/README.md`](docs/project-handoff/README.md).

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
- Opportunity-first lap analysis that ranks the corners and straights where the selected lap loses the most time, with complete and partial laps, timing sectors, and manual corrections.
- Synchronized time- or distance-based speed, GPS-derived acceleration, and Delta-T charts with linked cursors, drag selection, scroll/pinch zoom, and map-section filtering.
- Automatic reusable track presets: matched TrackProfile sections are preserved; otherwise a repeatable start/finish line and editable corner/straight sections are generated from closed-course GPS passes.
- Lap Explorer graphs for detailed distance-based Speed and Delta-T comparison at whole-lap, corner, or straight scope, plus a section-by-lap metrics matrix.
- A browser-local Track Library for single TrackProfile JSON and multi-track catalog import/export, application, and deletion.
- Segment `.Vta`, transformed segment `.Vta`, GPS CSV, sensor CSV, validation CSV, and summary JSON export.
- Multilingual UI with primary English and Korean translations plus secondary Japanese, Simplified Chinese, Spanish, French, and German translations.
- Client-side trace processing: raw VTA rows and GPS traces are not uploaded by the app. Optional automatic track lookup sends an expanded recording bounding box to OpenStreetMap Overpass.

## Language support

OpenVTA Analyzer includes an in-app language selector. English and Korean are primary, high-quality translations. Japanese (`ja`), Simplified Chinese (`zh-CN`), Spanish (`es`), French (`fr`), and German (`de`) are included as secondary translations.

The selected UI language persists locally in the browser under `openvta.language.v1`. It is not uploaded or synchronized by the app.

Language selection changes app UI text only. For compatibility, export schemas, CSV headers, JSON keys, generated VTA metadata, filenames, units, and parsed source data are not localized.

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

## Lap Analysis workflow

Lap Analysis works with a matched track profile, an imported profile, or no known track at all:

1. Load one recording and open **Lap Analysis**. The app checks locally cached track profiles first. If no fresh match exists, it automatically searches OpenStreetMap raceway data around an expanded bounding box of the recording.
2. The app preserves the start/finish and sections from a matched or imported `.openvta-track.json` profile. If no preset matches, repeated closed-course GPS passes automatically generate a directional start/finish line and a reusable recording preset. Open routes remain trackless instead of receiving a speculative lap gate, and ambiguous layout candidates still require an explicit choice.
3. Start in **Insights**. Select a lap and review the ranked time-loss opportunities, loss-colored map sections, fastest lap, theoretical best, and selected-lap potential. Selecting a card or map section scopes the synchronized speed, GPS-derived acceleration, and Delta-T charts to the same section.
4. Drag across a chart to select the same GPS segment on the map, hover or click to synchronize the focused point, scroll/pinch to zoom, and switch the horizontal axis between elapsed time and distance.
5. Open **Compare** to select as many as five laps and use **Lap Explorer** for whole-lap, corner, or straight comparisons. Section distance and Delta-T are rebased to zero at the selected section start; primary and reference laps remain independently selectable.
6. Open **Setup** to adjust the start/finish width and bearing, correct boundaries, change validity, edit generated sections, and add or reorder timing-sector gates. The detector retains opening and closing fragments instead of silently deleting incomplete laps.
7. Review the section-by-lap matrix and detailed duration, best delta, entry/minimum/average/maximum/exit speed, lateral-G, and deceleration-G metrics. Export laps, timing sectors, corners, and analysis sectors as separate CSV files or export the complete lap analysis as JSON.

Only fully traversed sectors are reported for opening or closing fragments; a fragment with neither timing boundary is excluded from sector analysis. Completed sectors inside incomplete laps remain visible. By default they do **not** count toward Best Sector or either theoretical-best calculation. The Lap Analysis checkbox can include them for both timing and analysis sectors, and that global preference is remembered locally under `openvta.lapAnalysisSettings.v1`.

### TrackProfile JSON v1

Reusable track profiles are stable, versioned JSON documents. Version 1 contains:

- `schemaVersion: 1`, a stable `id`, circuit `name`, and optional `layoutName`;
- a WGS84 GeoJSON `centerline` using `[longitude, latitude]` coordinates and a travel `direction`;
- an optional WGS84 GeoJSON `analysisLine`, normally the resampled fastest valid complete lap, which provides a stable distance/progress axis without replacing the track identity centerline;
- optional start/finish, timing-sector, pit-in, and pit-out gates, each represented by a finite GeoJSON line plus forward bearing and width;
- editable distance-based `sections` for left corners, right corners, and straights, including optional `source` (`automatic` or `user`) and automatic-generation `confidence`, plus an optional pit-lane line;
- `source` provenance for user, recording, or OSM profiles, including OSM element IDs, fetch time, attribution, and ODbL metadata when applicable; and
- an `updatedAt` timestamp.

Malformed profiles and unsupported schema versions are rejected without replacing the active profile. **Save / export track** saves the current profile locally and downloads `<recording>.openvta-track.json`; importing that JSON makes it reusable for later recordings.

The header **Track Library** works before a VTA is loaded. It accepts either one TrackProfile v1 document or a catalog envelope with `schemaVersion: 1`, `kind: "openvta-track-catalog"`, and a `tracks` array. Every catalog entry and duplicate ID is validated before any profile is written, so a malformed catalog cannot partially update the library. Catalog and profile exports contain track definitions only, never VTA rows or recording samples.

### Track cache and automatic lookup

Track profiles are cached in the browser's IndexedDB database `openvta-analyzer`, in the `track-profiles` object store. Track Library catalog import uses one transaction. If IndexedDB is unavailable or blocked, an in-memory fallback keeps the complete validated batch usable for the current page session, and JSON import/export remains available. Cached profiles are scored against each new recording. A fresh OSM profile (less than 30 days old) avoids a network lookup; a stale match can remain visible while the app refreshes it.

Automatic lookup posts a raceway query containing an expanded recording bounding box to a public OpenStreetMap Overpass endpoint, with one fallback endpoint and a 15-second timeout per attempt. It does not send raw VTA rows, individual GPS samples, sensor records, selected laps, or exports. Ambiguous results require a layout choice. No-match, malformed-response, timeout, and offline results are non-fatal: a repeatable closed-course recording generates and persists its own local preset, while an open route remains available for the mapless manual-gate workflow.

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

Files are opened through browser APIs and parsed in memory. The app does not send raw VTA data, GPS traces, sensor rows, calibration files, or exports to a server.

When automatic track lookup is used, the app sends an expanded bounding box around the recording to public OpenStreetMap Overpass endpoints. This reveals the approximate recording area, along with normal request metadata such as IP address, user agent, and request time, to the selected Overpass provider. The raw VTA rows and individual GPS samples stay in the browser. Lookup can be unavailable, blocked, or fail without preventing manual/mapless lap analysis.

Interactive tiles are loaded from the configured tile URL, which defaults to OpenStreetMap-compatible tiles. Tile providers can see normal map tile requests for the visible viewport, such as tile coordinates, IP address, user agent, and request time. The VTA file contents, sensor rows, calibration values, selected segment, and exports are not sent to the tile provider by the app.

If tile privacy is more important than the interactive basemap, use the coordinate fallback by blocking tile requests or configuring a trusted/internal tile endpoint in the app settings. Offline tile packs are not bundled.

Calibration presets are stored only in browser local storage under the key `openvta.calibrationPresets.v1`. Presets contain the saved name, timestamp, offsets, unit, sample count, and source metadata needed to reapply the calibration. They are not synchronized across browsers or devices unless you export and import the presets JSON yourself. Invalid or incompatible preset JSON is ignored instead of preventing the app from loading.

## Scope

Included: practical legacy VTA_Road analysis parity for VTA loading, map review, linked charts, tables, calibration, filtering, segment extraction, and export in a zero-backend PWA.

Deferred: CAD editing tools, RT-3000/Vericom/Smarty imports, proprietary ECW backgrounds, offline tile packs, and Road Condition Monitoring calculations.
