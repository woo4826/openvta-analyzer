# Customizable Lap Dashboard Design

**Date:** 2026-07-15

## Goal

Turn the lap-analysis page into a configurable dashboard: files live in the global header, analysis controls stay available in a floating left drawer, a driver can isolate a single lap, optional analysis blocks remember their visibility, and map/graph/table widgets can be moved and resized instead of forming one long fixed page.

## Requirements

1. Remove the persistent left file rail and expose file selection, file metadata, removal, and additional import from the top bar.
2. Provide an explicit lap-display mode with `all`, `focus + reference`, and `focus only`. The selected mode must consistently constrain map overlays and the lap evidence table without changing the reference used to calculate Delta-T.
3. Move lap comparison controls, section filters, axis selection, partial-lap policy, widget visibility, and layout reset into a floating left analysis drawer that can be opened from anywhere in the lap workbench.
4. Let the user hide or show the biggest-loss ranking. Persist this and the other presentation settings across reloads with defensive localStorage parsing.
5. Use a maintained dashboard layout library so opportunity ranking, map, evidence, variation graph, telemetry graph, and lap table are draggable and resizable on desktop. Persist layouts per breakpoint. Use a deterministic single-column order on small screens where drag and resize are disabled.
6. Remove the rhetorical “Where am I losing time?” headline. The compact context header should identify the track and selected scope only.
7. Replace the long chip-only section selector with a proportional track navigator. A driver can click a named corner/straight, drag two accessible handles to define a custom range, or reset to the whole lap without leaving the analysis controls.

## Approaches Considered

### A. React Grid Layout dashboard — selected

`react-grid-layout` provides React 18 support, TypeScript types, responsive breakpoints, drag handles, resizing, layout serialization, and collision-aware packing. It directly matches the requested widget behavior while allowing OpenVTA to keep all state local.

### B. CSS Grid plus resizable split panes

This would be lighter and predictable, but it only supports fixed left/right arrangements. Implementing arbitrary reorder, collision handling, responsive layouts, keyboard-safe handles, and persistence ourselves would duplicate a dashboard library.

### C. GoldenLayout or FlexLayout docking shell

These libraries provide IDE-style tabsets, docking targets, and nested panes. They are powerful but introduce window-manager concepts that obscure the primary lap-analysis flow and require more custom integration for map/chart resize events.

## Information Architecture

### Global header: file workspace

The existing `Open VTA/ZIP` action remains. Beside it, an active-file button opens a top-bar popover. The popover lists loaded files, marks the active file, exposes row counts and format, supports switching/removal, and includes another import action. When only one file is loaded the control still appears, so the file workspace never disappears.

### Floating analysis drawer

The workbench owns a fixed left drawer below the application header. It is opened by a persistent `Analysis controls` button and can be closed without losing state. On narrow screens it becomes a modal-width sheet with a scrim; on desktop it floats above the full-width dashboard and does not reserve a permanent column.

Drawer groups:

- Comparison: focused lap and reference lap.
- Visible laps: all laps, focus + reference, or focus only.
- Scope: whole/corner/straight filter and section ribbon.
- Charts: distance/time axis and partial-lap sector policy.
- Widgets: one switch per widget, including biggest-loss ranking.
- Layout: reset to the recommended dashboard layout.

### Proportional section navigator

Use `@radix-ui/react-slider` for the two-thumb range interaction. It supplies controlled multi-thumb values, pointer/touch input, a minimum distance between thumbs, full keyboard navigation, and the WAI-ARIA slider pattern. OpenVTA layers domain visuals around the primitive:

- A compact overview strip represents the complete analysis-line distance.
- Each track section occupies a proportional width and is colored by kind: corner or straight.
- Clicking a section selects its exact stored boundaries and synchronizes map, graphs, and records.
- The two slider thumbs show start and end meters. While dragging, the selected range updates visually; the analysis scope commits on pointer/keyboard completion to avoid recalculating every chart for every pixel.
- A `Snap to section boundaries` switch is on by default. When enabled, committed values move to the nearest known boundary within a small tolerance; when disabled, values remain at the selected meter.
- The selected section or custom range is always shown as text, so color and position are not the only cues.
- The existing all/corner/straight filter remains in the drawer and filters the named section buttons without changing the full-distance scale.

### Widget dashboard

The desktop board uses twelve columns. The default layout places the map and telemetry graph side by side in the first analysis row, followed by variation/evidence and the lap table. Biggest-loss ranking is a compact top widget and is optional. Each widget has a dedicated drag handle and accessible title; interactive content is excluded from drag initiation. Resizing a widget naturally causes ECharts and MapLibre containers to observe their new bounds.

Breakpoints have independent saved layouts. Below 680 px, widgets render in a single logical order and drag/resize is disabled to prevent gesture conflicts. Hidden widgets are removed from the board but retain their last saved positions.

## State and Persistence

Add a versioned `SegmentWorkbenchPreferences` object:

```ts
interface SegmentWorkbenchPreferences {
  version: 1;
  drawerOpen: boolean;
  lapVisibility: "all" | "focus-reference" | "focus-only";
  visibleWidgets: Record<SegmentWidgetId, boolean>;
  layouts: Record<string, SegmentWidgetLayout[]>;
}
```

Defaults keep all widgets visible, use focus + reference for overlays, and use a two-column recommended desktop layout. Settings are stored under `openvta.segmentWorkbench.v1`. Parsing accepts only known widget IDs, finite integer layout values, and known modes; malformed or unavailable storage falls back to defaults. Analysis correctness state such as selected track, lap validity, or computed records is not serialized into this presentation object.

## Component Boundaries

- `TopbarFileWorkspace`: top-bar file popover only; no parser ownership.
- `SegmentWorkbenchControls`: floating drawer, control grouping, widget toggles, and reset action.
- `SegmentRangeNavigator`: proportional section strip plus Radix two-thumb range selection.
- `SegmentDashboard`: responsive grid library adapter and persistence callbacks.
- `DashboardWidget`: consistent title, drag handle, visibility semantics, and content boundary.
- `segmentWorkbenchPreferences`: validation/default/load/save helpers independent of React.
- `useSegmentWorkbench`: remains the source of comparison analysis state and gains only lap visibility behavior needed by map/table consumers.

`App` continues to own loaded files. `LapAnalysis` continues to own the setup/workbench switch. No VTA data, track location, sensor rows, or computed telemetry leaves the browser.

## Accessibility and Interaction

- The file and control popovers use buttons with `aria-expanded`, explicit dialog/region labels, and Escape/close controls.
- Every widget title is visible and its drag handle has an accessible label. Buttons, selects, charts, and maps are excluded from drag initiation.
- Hiding a widget moves focus back to the drawer toggle when necessary.
- The drawer scrim closes the mobile sheet; desktop users can close with its button.
- `focus only` hides other lap paths and table rows but leaves reference-lap calculations intact and clearly identifies the retained Delta-T reference in the drawer.

## Error Handling

- Blocked or malformed localStorage never prevents analysis.
- A saved layout missing a newly introduced widget receives that widget’s default position.
- Removing the active file selects the nearest remaining file and closes a now-empty file popover.
- At least one dashboard widget must remain visible; the final visible widget toggle is disabled.

## Verification

- Unit tests cover preference defaults, round-trip persistence, malformed data, missing widgets, and last-widget protection.
- Component tests cover file switching/removal in the top bar, drawer controls, lap-only visibility, ranking toggle persistence, and layout reset.
- Component tests cover proportional section selection, two-thumb range commits, boundary snapping, and keyboard-accessible thumb labels.
- Browser tests cover drag/reorder, resize, reload persistence, mobile single-column behavior, focus-only map/table output, range dragging, no horizontal overflow, and opening the real user VTA.
- Production verification uses `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`, confirms Inje preset matching, toggles the loss widget, isolates one lap, moves a map/graph widget, reloads, and confirms persistence.
