# Map Section Click and Selection Synchronization Design

**Date:** 2026-07-16  
**Status:** Approved direction; implementation pending  
**Target:** `openvta-analyzer` Lap Analysis and Setup views

## Goal

Make a map click select the physical track section under the pointer, move the shared analysis cursor to that click, and update every selected-section indicator immediately. The behavior must remain correct on close parallel track branches, with built-in or generated track presets, and in the SVG fallback map.

## Confirmed root causes

### 1. Map and analysis use different distance coordinate frames

The segment workbench analyzes section ranges against `analysisLine`, which begins at the recording's start/finish crossing. `SegmentTrajectoryMap` currently draws and hit-tests those ranges against `profile.centerline`, whose first coordinate may be an arbitrary OSM node.

For the supplied Inje Speedium profile, the start/finish projects to approximately 1,961.7 m along `profile.centerline`. Consequently, a section ID selected from the map can be applied almost half a lap away by the analyzer.

### 2. MapLibre trusts the first overlapping feature

The `track-sections` click handler uses `event.features[0]`. At hairpins and close parallel branches, multiple section lines may be inside the hit width, and feature order does not express which line is closest to the pointer.

### 3. Workbench and Setup keep separate section selection state

The workbench stores its selected section in `useSegmentWorkbench.scope`. The Setup editor separately stores `LapAnalysis.selectedSectionId`. Selecting a section in one view does not update the other, so the section editor, map highlight, scope ribbon, chooser, and summary can disagree.

## Considered approaches

### A. Draw the map with `analysisLine` only

This fixes the large coordinate-frame offset, but `features[0]` remains ambiguous on close branches and the Setup selection still remains separate.

### B. Unified projection and synchronized selection — selected

Use `analysisLine` for section geometry, project the geographic click coordinate onto that same line, resolve the section from projected distance, and move the shared cursor to the nearest focused-lap sample. Synchronize the selected section ID between the workbench and Setup editor.

### C. Sort overlapping rendered features only

This can improve close-branch clicks but cannot repair the 1,961.7 m coordinate-frame mismatch or the duplicated React state.

## Selected behavior

### Section geometry and hit testing

- The segment workbench passes `analysisLine` to `SegmentTrajectoryMap` as the section centerline.
- `RouteMap` converts a generic MapLibre `event.lngLat` click to a GeoJSON coordinate instead of depending on delegated hit-testing of a transparent section layer.
- A pure resolver projects that coordinate onto the section centerline with `projectCoordinateToLineProgress`.
- The resolver also reports geographic offset from the analysis line. Clicks more than 100 m away are ignored; this covers the observed 4–75 m preset-to-1 Hz GPS deviation in the supplied Inje recording while rejecting clear off-track clicks.
- The section whose `[startDistanceMeters, endDistanceMeters]` contains the projected distance wins.
- At an exact shared boundary, prefer the section beginning at that boundary, except at the total line length where the final section wins.
- If a profile has gaps or slightly truncated end distances, choose the section with the smallest distance-to-range error. This keeps imported imperfect profiles usable.
- Do not use rendered-feature ordering to choose the section.

### Cursor synchronization

The section click callback carries:

```ts
interface MapSectionSelection {
  sectionId: string;
  coordinate?: Position;
  distanceMeters: number;
  offsetMeters?: number;
}
```

`SegmentTrajectoryMap` finds the focused-lap trajectory sample nearest to `distanceMeters` and emits its source index before/with the section selection. The existing selected-point effect then normalizes the cursor to the new scope-relative distance after the section analysis is rebuilt.

The visible result of one click is:

1. selected section changes;
2. map fits that section;
3. focused/reference map markers move to the click progress;
4. Speed, Delta-T, G-G/3D vector, inset, and numeric cursor readout use the same position;
5. the scope ribbon, chooser, header summary, and Setup editor show the same section ID.

### SVG fallback

The SVG section polyline has no MapLibre `lngLat`. Its click uses the midpoint of the section's declared distance range. The same callback shape is emitted, so section and cursor synchronization remain available when map tiles or WebGL fail.

## State synchronization

- `LapAnalysis.selectedSectionId` remains the shared explicit section selection used by the Setup editor and its map highlight.
- `SegmentAnalysisWorkbench` receives `selectedSectionId` and `onSelectedSectionId` props.
- Every explicit workbench selection (map, ribbon, chooser, previous/next) runs one wrapper that updates both the workbench scope and the shared section ID in the same event.
- When Setup changes its dropdown or map selection, the mounted workbench synchronizes its internal section scope to the shared ID before it becomes visible again.
- Whole-lap and custom-range modes do not erase the last explicit section in Setup; they change the analysis scope only. Selecting a new section replaces the shared ID immediately.
- Invalid/deleted section IDs continue to fall back to the first available Setup section and to whole-lap analysis in the workbench.

## Component changes

### `RouteMap`

- Add the pure click-distance resolver and `MapSectionSelection` callback metadata.
- Store the latest section centerline and sections in refs used by the long-lived MapLibre handler.
- Use click projection rather than `event.features[0]`.
- Emit section midpoint distance from the SVG fallback.

### `SegmentTrajectoryMap`

- Receive section click metadata.
- Pick the focused trajectory sample nearest to the absolute click distance.
- Update selected source index/cursor and then forward the resolved section ID.

### `SegmentAnalysisWorkbench`

- Draw sections with `analysisLine`.
- Route map/ribbon/chooser/previous-next through one synchronized selection callback.
- Accept and synchronize the shared Setup section ID.

### `LapAnalysis`

- Pass its selected section ID and setter to the workbench.
- Keep Setup dropdown and Setup map using the same setter.

## Error and edge handling

- Ignore clicks when the centerline or section list is empty.
- Reject non-finite click coordinates and projection results.
- Clamp click distance to the usable line length.
- Ignore MapLibre clicks whose projected offset is greater than 100 m.
- If no focused-lap sample exists, still select the section without moving the cursor.
- Preserve existing direct route-point selection outside section clicks.
- Preserve keyboard section selection and the SVG fallback's accessible buttons.
- No VTA, track, or selection data leaves the browser.

## Test plan

### Unit and component regression tests

- Resolver chooses the section containing projected click distance even when a wrong feature appears first.
- Resolver distinguishes two close parallel branches by coordinate distance.
- Boundary, gap, truncated final section, invalid coordinate, and empty input cases.
- Generic MapLibre handler emits the resolver result and click distance, not `features[0]`; a far off-track click emits nothing.
- SVG fallback emits section midpoint distance.
- `SegmentTrajectoryMap` moves the selected source index to the sample nearest the click distance.
- Workbench uses `analysisLine` for map section geometry.
- Workbench map/ribbon selection updates its scope and the shared Setup section ID.
- External Setup selection updates the hidden workbench scope before returning to Insights.

### Browser and supplied-file verification

Using `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`:

- verify Inje Speedium match, 1,589 GPS fixes, and 158,289 sensor rows;
- click at least four separated physical sections, including close hairpin branches;
- confirm selected ID/range matches the clicked physical location;
- confirm cursor, map markers, Speed, Delta-T, and acceleration view move together;
- switch between Insights and Setup and confirm the same selected section remains highlighted and selected;
- repeat a representative click at mobile width;
- verify zero console/page errors.

### Release gate

Run typecheck, lint, all Vitest tests, production build, all Playwright tests, and `git diff --check`. Push `main`, monitor both CI and Pages to success, then repeat the supplied-file map click flow on the production URL with Aside.
