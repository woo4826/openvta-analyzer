# Automatic Sector and Lap Explorer Design

## Goal

Extend OpenVTA Analyzer so a single VTA recording can automatically produce reusable corner and straight sectors, compare every lap inside each sector, explore distance-based speed and Delta-T graphs, and manage predefined TrackProfile JSON files from a dedicated menu. The workflow remains zero-backend, works without map tiles or a known track, and deploys on GitHub Pages.

## Product terminology

OpenVTA keeps two complementary concepts explicit:

- **Timing sectors** are bounded by directional gates. They preserve the existing official/manual sector workflow and interpolated gate-crossing times.
- **Analysis sectors** are contiguous distance ranges classified as left corner, right corner, or straight. They are generated automatically and power the new per-lap sector explorer even when no timing gates exist.

The UI calls the second concept **automatic sectors**. It never silently replaces imported timing gates. A TrackProfile may contain both.

## Automatic-sector generation

The fastest valid complete lap is the representative trace. If no valid complete lap exists, automatic generation is unavailable and the existing manual start/finish and timing-gate tools remain usable.

Generation performs the following deterministic steps:

1. Resample the representative lap every five metres.
2. Smooth signed curvature and speed over a short moving window.
3. Classify sustained positive curvature as right corner, sustained negative curvature as left corner, and the remaining range as straight.
4. Merge noise islands and ranges shorter than 20 metres into the most compatible neighbour.
5. Split a straight longer than 500 metres at a low-curvature midpoint so the explorer remains useful on long circuits.
6. Expand the result into a complete, non-overlapping partition from zero to representative-lap distance. No gaps or overlaps are allowed.

Automatically generated sections receive stable distance-derived IDs, localized display names, `source: "automatic"`, and a confidence value from zero to one. Editing the name, kind, or boundary changes `source` to `user` and removes the confidence value. Existing TrackProfile v1 files without these optional fields remain valid.

TrackProfile v1 also gains an optional `analysisLine`. Automatic section distances are measured on this representative-lap line, while the original `centerline` remains unchanged for OSM matching, attribution, and layout identity. Imported profiles without `analysisLine` continue to measure sections on `centerline`.

The first valid complete lap automatically creates analysis sectors when the active profile contains none. **Recalculate automatic sectors** explicitly replaces only sections whose source is `automatic`; user/imported sections are preserved unless the user confirms full replacement.

## Per-lap analysis model

Every lap is projected onto `analysisLine ?? centerline`, converted to monotonic track progress, and resampled by that progress. This keeps corners aligned when driven distance differs slightly from the profile line. It also lets a partial-start or partial-end lap contribute only the sections whose two boundaries were actually traversed; an unanchored partial-both lap is excluded from automatic-section metrics.

For each lap and analysis sector the analyzer calculates:

- duration;
- delta to the best eligible lap for the same sector;
- entry, minimum, average, maximum, and exit speed;
- maximum GPS-derived lateral G and deceleration G;
- whether the result came from a partial lap;
- whether it is eligible for sector-best and theoretical-best calculations.

A partial lap contributes a section only when it covers both section boundaries. The existing remembered partial-sector option controls eligibility for best calculations. It does not hide the result.

The automatic theoretical best is the sum of the best eligible analysis-sector durations. The existing gate-sector theoretical best remains available and clearly labelled.

## Distance-based Speed and Delta-T explorer

The Lap Analysis screen gains an **Analysis Explorer** between the lap table and sector results.

Controls provide:

- a scope selector for whole lap or any automatic sector;
- previous/next scope buttons;
- a focused lap selector with previous/next lap buttons;
- the existing five-lap comparison selection and a valid complete reference lap;
- quick filters for all sectors, corners, or straights.

The graph overlays selected laps using local distance within the chosen scope. Speed uses the left axis. Delta-T against the pinned reference lap uses the right axis and is rebased to zero at the scope start, so a corner or straight graph shows time gained or lost inside that section rather than before it. Tooltip, legend scrolling, wheel/pinch zoom, a visible zoom slider, and reset zoom support exploration.

Below the graph:

- a section-by-lap matrix shows duration and delta-to-best in each cell;
- clicking a row opens that scope in the graph;
- a detailed table shows the selected scope's speed and G metrics for every available lap;
- partial and best-eligibility states remain visible.

## Track Library menu

A new **Track Library** button in the application header opens a modal that is available before or after loading a VTA file.

The library supports:

- listing locally stored profiles with name, layout, source, direction, section count, and update time;
- importing one or more `.openvta-track.json` files;
- importing an `.openvta-track-catalog.json` file containing multiple TrackProfile v1 documents;
- exporting one profile or the whole catalog;
- deleting a profile after confirmation;
- applying a profile to the current recording when one is loaded.

Catalog JSON uses a separate stable envelope:

```json
{
  "schemaVersion": 1,
  "kind": "openvta-track-catalog",
  "tracks": []
}
```

Each entry is validated with the existing strict TrackProfile parser. Import is atomic: if any entry is invalid or IDs repeat, nothing is saved. Applying a library profile resets lap boundary and validity overrides because gate geometry may change, but does not alter the VTA file.

All profiles remain in IndexedDB with the existing in-memory fallback. Import, export, analysis, and editing stay entirely client-side. OSM lookup retains its existing privacy disclosure.

## Architecture and boundaries

- `src/domain/automaticSections.ts` owns deterministic generation and partition validation.
- `src/domain/sectionAnalysis.ts` owns distance mapping, per-lap metrics, scoped Speed/Delta-T samples, best-sector values, and automatic theoretical best.
- `src/domain/trackCatalog.ts` owns catalog parsing and export without storage side effects.
- `src/app/useTrackLibrary.ts` coordinates IndexedDB list/import/delete/export refresh state.
- `src/components/TrackLibrary.tsx` renders the header modal and has no lap-analysis calculations.
- `src/components/LapExplorer.tsx` owns scope and lap navigation UI and renders the graph/matrix from prepared domain results.
- `src/app/useLapWorkspace.ts` applies profiles and automatically seeds sections, while preserving per-file/per-GPS-source isolation.
- `src/components/LapAnalysis.tsx` composes existing timing-sector tools with the new explorer.

This split keeps geometry, analysis, storage orchestration, and presentation independently testable and prevents the already large Lap Analysis component from absorbing more domain logic.

## Compatibility and failure behaviour

- TrackProfile schema version remains `1`; `analysisLine`, `TrackSection.source`, and `confidence` are optional additive fields.
- Existing profile, lap, timing-sector, corner, and VTA export schemas remain stable.
- Section-analysis CSV and JSON are new exports with canonical English keys and SI/base units.
- Invalid catalog/profile imports report a localized error and do not replace the active profile or partially update storage.
- Automatic generation failure leaves existing sections untouched and presents a non-fatal explanation.
- Missing reference laps hide Delta-T series but keep speed graphs and per-lap metrics.
- Unknown tracks, offline OSM, missing map tiles, and partial recordings retain the manual/mapless workflow.

## Testing and release evidence

Completion requires:

1. Domain tests proving full non-overlapping automatic partitions, stable IDs, corner direction, long-straight splitting, normalized per-lap section mapping, scoped Delta-T rebasing, partial eligibility, and catalog atomicity.
2. Component tests proving menu import/list/apply/delete states, explorer scope/lap navigation, graph series, matrix selection, and accessible disabled/error states.
3. App integration tests proving the Track Library opens without a VTA file and applying a profile updates the active lap workspace.
4. The existing typecheck, lint, unit, build, and browser suites.
5. Direct analysis of `VTA24082025_101142_CC00.Vta` proving generated corners/straights, metrics across detected complete laps, scoped graph samples, and TrackProfile/catalog round trips without printing raw coordinates.
6. Desktop and mobile browser QA of the deployed GitHub Pages build, including no horizontal overflow and no console errors.
