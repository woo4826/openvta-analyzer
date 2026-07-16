# Synchronized Telemetry Layouts Design

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Repository:** `openvta-analyzer`

## Goal

Split the Lap Analysis telemetry visualization into three independent charts
without losing spatial context. Hovering, clicking, or using the keyboard in any
chart must move one shared cursor across all three charts, the main trajectory
map, and the compact track inset.

Users can choose among three layouts. The browser remembers the last choice
across recordings, and a new installation defaults to the three-column
dashboard.

## Scope

The three charts are fixed for this iteration:

1. focused/reference speed;
2. focused-minus-reference Delta-T;
3. focused-lap measured device X/Y/Z acceleration.

The feature preserves the existing distance/time axis control, lap and section
selection, synchronized sensor evidence, telemetry keyboard navigation, track
inset, and GPS-confidence messaging. It does not add new derived vehicle-axis
signals or reinterpret raw device acceleration as longitudinal/lateral G.

## Layouts

The telemetry header provides an accessible single-choice layout control with
three options:

- `three-column`: Speed, Delta-T, and acceleration in one horizontal row. This
  is the default.
- `two-plus-one`: Speed and Delta-T in the first row; acceleration spans the
  full second row.
- `three-stacked`: Three full-width rows.

The selector is always visible in the telemetry widget header. Each option uses
text as well as an icon, exposes selected state with `aria-pressed`, and has a
minimum 44 px target.

At narrow breakpoints the visual layout collapses to three stacked rows to
preserve chart readability. The saved preference is not overwritten, so the
chosen desktop layout returns when the viewport widens.

## Architecture

### Shared controller

`SegmentTelemetryChart` remains the domain-level controller. It owns no second
cursor; it receives the controlled `cursorDistanceMeters` from the workbench
and routes all chart interactions through the existing `onCursor` callback.

Each child chart receives:

- one metric-specific ECharts option;
- the current axis mode;
- a cursor X value derived from the shared distance;
- the common hover, click, and keyboard handlers;
- the common zoom window.

The canonical cursor is always distance along the active analysis scope. In
distance mode a hovered X value can be used directly. In time mode the
controller finds the nearest focused-lap trajectory sample and converts its
elapsed time to distance. The resulting source index is sent to the workbench,
which already updates the trajectory map and recording selection.

### Metric charts

Introduce a small metric chart component around `ChartPanel`. The component is
presentational and does not own cursor or lap-selection state. Three instances
render speed, Delta-T, and measured acceleration independently.

Refactor `buildSegmentTelemetryOption` so it can create one metric option at a
time while retaining the existing focused/reference colors, dashed reference
line, zero baselines, low-animation behavior, acceleration downsampling, and
axis labels. The pure option builder remains testable without React.

### Chart interaction contract

`ChartPanel` gains a controlled domain-window contract for split charts:

- moving the pointer emits a domain value at most once per animation frame;
- clicking resolves the closest source sample and pins the same shared cursor;
- Arrow, Page, Home, and End keys use the focused trajectory and update all
  views through the same callback;
- a data-zoom change emits a normalized start/end percentage;
- a controlled zoom window is applied to every chart instance without an event
  loop.

Only one visible zoom slider is rendered for the chart group. Inside-wheel or
pinch zoom from any chart updates the shared window, and all three charts adopt
it. Resetting the analysis scope restores the window to 0–100%.

The synchronized cursor presentation includes a vertical line in every chart
and current values in the shared telemetry readout. ECharts tooltip state is
treated as transient; correctness does not depend on a tooltip remaining open
in inactive charts.

## Data Flow

```text
hover/click/key in any metric chart
  -> chart domain value
  -> distance (direct or focused-lap time-to-distance conversion)
  -> nearest focused trajectory sample and source index
  -> SegmentAnalysisWorkbench cursorDistanceMeters + selectedPointIndex
  -> speed cursor
  -> Delta-T cursor
  -> acceleration cursor
  -> main trajectory map marker
  -> focused/reference track-inset markers
  -> shared numeric readout
```

This keeps distance as the stable cross-view identity even when focused and
reference laps reach the same distance at different elapsed times.

## Preference Persistence

Extend `SegmentWorkbenchPreferences` with:

```ts
telemetryLayout: "three-column" | "two-plus-one" | "three-stacked";
```

The default is `three-column`. Loading validates the stored enum and falls back
to that default for missing or invalid data. The preference is browser-wide,
not recording-specific, and uses the existing workbench preference storage and
migration path.

## Empty and Degraded States

- If measured acceleration is unavailable, keep the acceleration chart card in
  the selected layout and show a localized unavailable state. Speed and Delta-T
  remain interactive.
- If no reference lap is available, the speed chart shows the focused lap and
  the Delta-T card explains that a reference lap is required.
- If the focused trajectory is empty, all three cards show the existing
  unavailable state and do not emit cursor updates.
- Low or unknown GPS confidence continues to qualify derived advice. Raw device
  X/Y/Z retains the existing explanation that it is not vehicle-axis aligned
  and Z may contain gravity.

## Accessibility

- The chart group is one labeled telemetry region containing three individually
  named chart regions.
- All three charts are keyboard focusable and expose the existing keyboard
  shortcuts.
- Focused/reference identity continues to use solid/dashed line styles in
  addition to color.
- Layout selection is operable by keyboard and announced by name and selected
  state.
- The shared readout remains a polite live region and is updated once per shared
  cursor change, not independently by each chart.

## Performance

Three ECharts instances replace one multi-grid instance. To keep interaction
smooth:

- the controller memoizes one option per metric;
- acceleration retains extrema-preserving downsampling;
- pointer movement remains animation-frame throttled;
- cursor rendering uses graphic updates rather than rebuilding chart data;
- layout changes reuse analysis data and only recreate layout-dependent chart
  containers when required;
- inactive Lap Analysis views continue to release chart resources.

## Testing

### Pure and preference tests

- default layout is `three-column`;
- all three valid layouts round-trip through local storage;
- missing and invalid stored values migrate to the default;
- each metric option contains only its intended series and common domain;
- acceleration downsampling and Delta-T sign semantics remain unchanged.

### Component tests

- hover from each of the three charts updates the one shared distance cursor;
- time-axis hover converts through the focused trajectory;
- all chart cursor lines receive the controlled position;
- map selection callback receives the corresponding source index;
- shared zoom from any chart updates the other two without recursion;
- layout switching changes CSS layout while preserving cursor, zoom, focused
  lap, reference lap, and scope;
- missing acceleration and missing reference states remain usable;
- keyboard cursor movement works from every chart;
- narrow viewport CSS stacks the cards without changing the saved preference.

### Browser tests and Aside QA

Using the supplied VTA, verify all three layouts on whole-lap and Corner 6
scopes. In each chart, move the pointer and confirm the same distance/time in the
other charts, the main map, the track inset, and the numeric readout. Repeat in
distance and time modes, exercise zoom, reload the page to verify persistence,
and check desktop and mobile-sized viewports.

## Deployment Gate

Before deployment, run typecheck, lint, all Vitest tests, production build, and
desktop/mobile E2E. After pushing `main`, monitor CI and Pages to success, then
load the supplied VTA in the production URL and repeat layout persistence and
cross-chart/map cursor synchronization checks with Aside.
