# Legacy VTA Feature Parity And UX Redesign

## Goal

Upgrade OpenVTA Analyzer from a first-pass functional web tool into a credible replacement for the useful analysis workflows in the legacy VTA_Road Windows program, while keeping the project zero-cost, client-side only, public, and deployable through GitHub Pages.

This spec does not try to recreate the legacy CAD application. It preserves the vehicle trajectory analysis capabilities that matter for VTA files, improves the missing workflow aids, and replaces the current basic UI with a compact analysis-oriented design system.

## Evidence Base

Sources inspected on 2026-06-28:

- Legacy VTA Program page: `https://www.testcell3.com/vta-program.html`
- Legacy Road Condition page: `https://www.testcell3.com/road-condition.html`
- Public document archive: `http://www.testcell5.com/Documents.zip`
- Public Android logger archive: `http://www.testcell5.com/VTALogger.zip`
- Public VTA_Road v1.11 installer archive: `http://www.testcell5.com/VTA_Road_Setup_V111.zip`
- Extracted PDFs from `Documents.zip`:
  - `VTA_Program.Pdf`
  - `VTALogger_V102a.pdf`
  - `DataFormat_Phone.pdf`
  - `DataFormat_IMU.pdf`
  - `IMU_Box.pdf`

Current OpenVTA Analyzer baseline:

- Public repo: `https://github.com/woo4826/openvta-analyzer`
- Public app: `https://woo4826.github.io/openvta-analyzer/`
- Current implementation includes parsing, map, charts, tables, calibration, filtering, export, CI, and Pages deploy.

## Legacy Capability Inventory

### Core Recorder And Input Model

The legacy system consists of:

- An Android VTALogger app that records `.Vta` files.
- A standalone IMU box format with 10 Hz GPS and 100 Hz inertial rows.
- A Windows VTA_Road program that loads one or more data files for analysis.
- Optional disabled import paths for RT-3000, Vericom VC4000, Smarty BX-1000, and later RCM files.

OpenVTA Analyzer should remain an analyzer, not a recorder. It must preserve broad `.Vta` compatibility and make unsupported import formats explicit instead of pretending to parse them.

### Viewing And Inspection

The legacy program shows the vehicle path as speed-colored dots. Users can adjust speed color ranges, point size, and background color. The program can also use a raster or ECW image as a manually aligned background.

The legacy charts include:

- Velocity strip chart.
- Velocity distance and average summaries.
- Acceleration chart with GX/GY/GZ and average summaries.
- Pitch/roll chart where data exists.
- Velocity plus acceleration chart on a shared time basis.
- Friction circle / GG diagram.
- Chart panning, zooming, and a vertical readout cursor.

Current app coverage is partial: the chart set exists, but linked hover/crosshair, average panels, speed color configuration, point-size controls, source toggles, and a strong selection model are still missing or incomplete.

### Path Segment Extraction

The legacy Path tool lets users select dots, set segment start/end, inspect point details, preview a summary, and save the extracted segment as a new file.

Current app has numeric segment start/end and `.Vta` export, but it lacks map-driven start/end picking, chart brush selection, synchronized segment highlighting, and a richer segment summary.

### Calibration And Filtering

The legacy program supports:

- Loading and processing `CAL*.Vta` files.
- Manual calibration values.
- Saving calibration values.
- Using a stationary test file region when no separate CAL file exists.
- Optional Butterworth low-pass filtering for acceleration.

Current app supports CAL load, session estimate, manual offsets, and a low-pass filter. Missing pieces are persistent named presets, explicit raw/calibrated comparison mode, static-window selection, clearer filter provenance, and a stronger distinction between original and transformed data.

### Tables, Utilities, And Validation

The legacy program exposes:

- GPS data table.
- Inertial data table.
- File summary utility.
- End-of-line conversion utility for Windows compatibility.
- Velocity-to-acceleration validation grid.

Current app has GPS/sensor tables and export. Missing items are sortable columns, visible-row CSV export, file summary details, validation of acceleration derived from velocity, and line-ending export mode.

### Regions And Measurement

The legacy Regions tool supports a rectangular region over the trajectory, region dimensions, average velocity within the region, and a road roughness / pit score. The CAD tools also include distance and area measurement.

OpenVTA Analyzer should implement region analysis only where it supports trajectory analysis:

- Draw a rectangular or rotated region on the map.
- List points inside the region.
- Compute dimensions, point count, time range, average speed, max speed, and acceleration summary inside the region.
- Defer road roughness / pit score until formulas and representative RCM files are available.

### CAD Functions

The Windows app contains CAD menus for drawing, editing, layers, blocks, raster insertion, printing, object snapping, line styles, and plugins. These are inherited from its CAD engine.

OpenVTA Analyzer should not implement general CAD editing. It should implement only the analysis-adjacent subset: measurement, overlays, background settings, and exportable screen/report snapshots.

### Road Condition Monitoring

The Road Condition page exposes static RCM examples through `Mine1`, `Mine2`, and `Mine3` links. The VTA Program page says v1.11 adds an import option for RCM data files. The available public pages do not provide enough formulas or raw sample files to reproduce RCM calculations with confidence.

RCM must remain a documented future module. The UI can reserve a disabled "Road Condition" analysis module with a clear requirement for raw examples and formulas.

## Required Functional Improvements

### 1. Workspace And File Management

Add a proper file workspace:

- Left or top compact file tray for all loaded files.
- Active file selector with parse health and detected format.
- Per-file summary: GPS rows, enhanced rows, sensor rows, duration, distance, warning count.
- Ability to remove a loaded file without resetting the app.
- Ability to compare up to two files in chart overlays for velocity, acceleration, and friction circle.

### 2. Map Analysis Tools

Upgrade the map from display-only to analysis workspace:

- Raw GPS, enhanced GPS, and source toggles.
- Adjustable point size.
- Configurable speed color thresholds and swatches.
- Fit route, reset selection, select start, select end, and clear segment controls.
- Segment highlight on route.
- Region rectangle tool with point-in-region summary.
- Optional tile URL setting stored in local storage.
- Map fallback remains coordinate-plot based when tiles fail.

Raster/ECW support is not part of the next implementation. A future background image module can support user-supplied raster overlays, but ECW should stay deferred because browser support requires specialized decoding and licensing review.

### 3. Linked Charts

Upgrade charts to match the legacy analysis workflow:

- Shared crosshair and selected point readout.
- Hover over velocity chart updates selected map point.
- Click/drag brush on velocity chart sets segment start/end.
- Average panels for velocity and acceleration over whole file or selected segment.
- Distance-over-time derived chart.
- Velocity-derived acceleration validation chart and table.
- Raw, calibrated, filtered, and comparison display modes.

### 4. Segment Extraction

Make segment extraction first-class:

- Segment state lives at app level, not only in Export.
- Start/end can be set from map point, chart brush, or numeric inputs.
- Segment summary includes duration, distance, average speed, max speed, min/max altitude, GPS count, sensor count, and warning count.
- Export options:
  - original segment `.Vta`
  - transformed segment `.Vta` with generated headers
  - GPS CSV
  - sensor CSV
  - summary JSON
  - validation CSV
- Export settings include line endings: LF or CRLF.

### 5. Calibration And Filtering

Improve Phase 2 from basic controls to a usable calibration workflow:

- Static window selector by elapsed time.
- Estimate offsets from CAL file, current full file, or selected static window.
- Named calibration presets in local storage.
- Preset import/export as JSON.
- Raw vs calibrated acceleration preview.
- Raw vs filtered preview.
- Filter settings show cutoff, sample-rate source, irregular timestamp warning, channel set, and transformed row count.
- Original data remains immutable; every view can switch back to raw.

### 6. Tables And Validation

Upgrade table functionality:

- Sort by column.
- Toggle column visibility.
- Export visible rows.
- GPS, enhanced, sensor, warnings, file summary, and validation tabs.
- Velocity-to-acceleration validation table.
- Low satellite and suspicious coordinate/unit warnings surfaced as actionable rows.

### 7. Reporting And Snapshots

Add lightweight reporting without a backend:

- Download current analysis summary as JSON.
- Export current chart data as CSV.
- Download a PNG snapshot of the current map or chart when technically feasible in the browser.
- Print-friendly summary page using browser print.

## Design System Direction

The current CSS is functional but template-like. The redesign should make the app feel like an engineering analysis instrument: dense, calm, structured, and fast to scan.

### Visual Principles

- Keep the first screen as the tool, not a landing page.
- Use compact panels, toolbars, tabs, and split panes.
- Avoid decorative cards and marketing-style hero sections.
- Use restrained color: dark graphite/navy shell, white analysis surfaces, teal for active state, amber for warnings, red for errors, green/yellow/orange/red for speed scales.
- Use 6px or 8px radius consistently.
- Use mono tabular numerals for measurements.
- Use icons for tools and short text only where commands need clarity.

### Design Tokens

Create a token layer in CSS:

- Color tokens: background, surface, panel, border, text, muted text, accent, accent-hover, warning, danger, success, speed-low, speed-mid, speed-high.
- Spacing tokens: 4, 8, 12, 16, 24.
- Radius tokens: 4, 6, 8.
- Shadow tokens: minimal elevation only for overlays and popovers.
- Typography tokens: UI text, compact label, metric value, mono numeric.

### Component System

Create reusable components:

- `AppShell`
- `TopBar`
- `ToolbarButton`
- `IconButton`
- `SegmentedControl`
- `Tabs`
- `Panel`
- `Metric`
- `StatusBadge`
- `DataToolbar`
- `DataTable`
- `Field`
- `Toggle`
- `RangeControl`
- `Drawer`
- `EmptyState`
- `WarningBanner`

These should replace ad hoc `panel`, `button`, `metric`, and layout classes as the app grows.

### Layout

Desktop target:

- Top bar: app name, file actions, active file, global settings.
- Secondary workspace row: file tray, parse status, warning count, transform mode.
- Main work area: map and analysis panel in a resizable split.
- Bottom inspector or right inspector: selected point, selected segment, current chart cursor.

Mobile target:

- Top controls stack cleanly.
- Summary and selected point remain high in the page.
- Tabs become horizontally scrollable.
- Dense tables remain scrollable without text overlap.

## Architecture Changes

### Domain State

Introduce app-level analysis state:

```ts
interface AnalysisState {
  activeFileId: string;
  selectedPointIndex: number;
  selectedSegment?: { startIndex: number; endIndex: number; source: "manual" | "map" | "chart" };
  displaySources: {
    rawGps: boolean;
    enhancedGps: boolean;
  };
  transformMode: "raw" | "calibrated" | "filtered" | "compare";
  mapSettings: MapSettings;
  chartSettings: ChartSettings;
}
```

### File Identity

`VtaFile` should receive a stable `id`, not rely on `sourceName` for React keys or active selection.

```ts
interface VtaWorkspaceFile extends VtaFile {
  id: string;
  loadedAt: number;
}
```

### Derived Views

Centralize derived data:

- `displayGpsPoints(file, sources)`
- `segmentGpsPoints(file, segment, sources)`
- `segmentSensorPoints(file, sensors, segment)`
- `deriveVelocityAcceleration(points)`
- `summarizeSegment(file, sensors, segment)`
- `buildValidationRows(points)`

### Local Storage

Use namespaced local storage keys:

- `openvta.mapSettings.v1`
- `openvta.chartSettings.v1`
- `openvta.calibrationPresets.v1`
- `openvta.uiDensity.v1`

All local storage reads must be recoverable if the stored data is invalid.

## Implementation Order

Recommended order:

1. Add domain state, segment summaries, validation rows, and tests.
2. Add design token CSS and reusable component primitives.
3. Refactor app shell and navigation into the new design system.
4. Upgrade map controls, source toggles, and segment selection.
5. Upgrade charts for linked crosshair, brush selection, averages, and validation.
6. Upgrade tables with sorting, visible exports, and warnings.
7. Upgrade calibration with static windows and presets.
8. Add reporting/snapshot exports.
9. Update README/user guide and E2E coverage.

## Testing Requirements

Unit tests:

- Parser remains compatible with modern OpenVTA, legacy phone, and IMU box rows.
- Segment summary handles reversed indexes, empty files, and enhanced/source toggles.
- Velocity-to-acceleration validation produces expected acceleration for simple velocity ramps.
- Calibration presets serialize/deserialize safely.
- Local storage fallback handles invalid JSON.
- Region point inclusion works for rectangular and rotated regions.

Browser tests:

- Load sample, switch source toggles, and see map/summary update.
- Brush velocity chart and verify segment export preview updates.
- Select map point and verify selected point inspector updates.
- Save/load calibration preset.
- Sort table and export visible rows.
- Mobile layout keeps tabs and toolbars usable.

Build gates:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

## Deferred Items

Deferred because they require missing formulas, proprietary formats, or disproportionate complexity:

- Full CAD drawing/editing menus.
- RT-3000, Vericom, and Smarty importers.
- RCM calculations and pit score formulas.
- ECW background decoding.
- Offline map tile packs.
- Server-side session storage.

## Approval Gate

Before implementation, confirm this product direction:

- Preserve the analysis workflows from VTA_Road.
- Do not rebuild the generic CAD editor.
- Prioritize UX/design system, map/chart/segment linkage, validation, and calibration workflow.
- Keep RCM and proprietary imports documented but deferred until raw files and formulas are available.
