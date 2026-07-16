# Cursor Acceleration Vector Design

**Date:** 2026-07-16
**Status:** Approved for implementation
**Repository:** `openvta-analyzer`

## Goal

Replace the rightmost measured-acceleration line chart in Lap Analysis with a
cursor-driven acceleration vector view. Moving the shared cursor over Speed or
Delta-T must update the focused lap, reference lap, map markers, track inset,
and acceleration vector at the same distance/time.

The default view is a two-dimensional G-G diagram. Users may switch the panel
to a three-dimensional vector view. The existing three dashboard layouts,
distance/time axes, shared brush zoom, and lap/section scopes remain available.

## Data Semantics

The supplied legacy VTA stores acceleration as device `GX`, `GY`, and `GZ` in
metres per second squared. It also shows the expected gravity contribution on
Z. The existing synchronization layer converts these values to G but does not
establish a verified device-to-vehicle mounting transform.

Consequently this feature uses honest labels:

- the 2D axes are `Device X` and `Device Y`, not lateral and longitudinal G;
- the 3D axes are `Device X`, `Device Y`, and `Device Z`;
- Z remains visible as a numeric value in 2D and may include gravity;
- the interpretation text states that mounting calibration is required before
  the plot can become a true vehicle-axis traction circle.

No new physical signal is inferred and no export schema changes.

## Chosen Visualization

### Default: 2D G-G

The panel contains a square Cartesian plot with equal X/Y scaling, crosshairs,
and concentric 0.5 G rings. At the canonical cursor distance it renders:

- the focused lap as a large filled point;
- the reference lap as an outlined diamond;
- a short, fading focused-lap trail ending at the selected point;
- device X, Y, Z and planar magnitude values;
- the focused/reference lap identities and synchronization quality.

The scale is symmetric around zero and expands in 0.5 G steps to include the
focused point, reference point, and local trail. It has a practical minimum of
1.5 G so low-motion data remains comparable across cursor movement.

The trail is local context, not a full-lap cloud: up to 25 synchronized samples
before the nearest cursor sample are shown. This makes vector direction and
transition readable without recreating the noisy line chart.

### Optional: 3D vector

The mode selector in the acceleration panel switches to an ECharts-GL
`scatter3D` view with equal device-axis ranges. The focused and reference
cursor points are plotted from the same nearest synchronized samples. Short
focused/reference line segments from the origin make the acceleration vectors
readable, while a small local focused trail provides motion context.

ECharts-GL is loaded dynamically only after the user selects 3D. The default
2D path therefore does not initialize WebGL or download the optional chunk.
The 3D camera may be rotated or zoomed locally, but it does not change the
canonical telemetry cursor or analysis scope.

If dynamic loading or WebGL initialization fails, the panel keeps the numeric
X/Y/Z readout and presents a localized 3D-unavailable message with a control to
return to 2D.

## Library Decision

Use the existing Apache ECharts dependency for the 2D scatter plot. It already
provides Cartesian scatter series, graphic rings, animation-free updates, and
the same lifecycle used throughout the analyzer.

Add `echarts-gl` for the optional 3D view. It is the official ECharts extension
for 3D plots and integrates with the existing chart runtime. Plotly.js and a
new Three.js scene were rejected because they would introduce a second chart
lifecycle and styling/accessibility contract for one optional panel.

## Component Architecture

Add `SegmentAccelerationVectorPanel` as a sibling of the two remaining
`ChartPanel` instances. `SegmentTelemetryChart` continues to own the canonical
distance cursor and passes the vector panel:

- focused and reference synchronized acceleration series;
- `cursorDistanceMeters`;
- selected `AccelerationVectorMode`;
- localized labels and interpretation text.

The vector panel never owns analysis position. It finds the nearest sample in
each lap and derives its local trail. Speed and Delta-T remain the only
brushable domain charts; their hover, click, keyboard, and zoom callbacks keep
the map and vector panel synchronized.

The existing measured-acceleration ECharts option and six-or-more raw X/Y/Z
line series are removed from the core dashboard path. Pure helper functions
build the 2D and 3D options so their semantics can be unit-tested without
mounting WebGL.

## Preference and Interaction

Extend `SegmentWorkbenchPreferences` with:

```ts
accelerationVectorMode: "gg-2d" | "vector-3d";
```

The default is `gg-2d`. Loading an older v2 preference object supplies this
default, and invalid stored values also fall back to it. The user's selection
is saved browser-wide with the other workbench presentation preferences.

The mode selector is a two-button `aria-pressed` group inside the acceleration
panel header. Switching modes preserves cursor, active scope, focused/reference
roles, telemetry layout, and shared zoom.

## Empty, Partial, and Multi-Lap Behavior

- The vector compares the focused and reference laps only. Additional visible
  laps remain available in Speed and Delta-T but do not overcrowd the vector.
- A missing reference sample leaves the focused point and trail usable.
- A missing focused sample presents the existing measured-acceleration
  unavailable state and keeps Speed/Delta-T interactive.
- A partial lap is shown wherever synchronized samples exist inside its covered
  distance. No extrapolation is performed beyond coverage.
- Changing lap, section, custom range, axis, or layout recomputes nearest
  samples from the current synchronized series without retaining stale points.

## Accessibility and Responsive Behavior

- Both views expose a concise chart summary and a visible numeric X/Y/Z
  fallback.
- Focused and reference identities use fill/outline and circle/diamond shapes,
  not color alone.
- The 2D diagram uses equal visual scaling and retains readable labels when the
  dashboard stacks at narrow widths.
- The 3D canvas is supplemental; every value it encodes is also present as
  text, so keyboard and screen-reader users do not depend on camera control.
- Reduced-motion preferences disable point transition animation.

## Performance

- Nearest-sample lookup uses binary search over distance-sorted synchronized
  samples.
- The local trail is capped at 25 points.
- 2D option updates are memoized and do not rebuild Speed or Delta-T data.
- `echarts-gl` is a lazy chunk and WebGL resources are disposed when leaving 3D
  or unmounting Lap Analysis.
- The vector view has no brush or domain hover handlers, avoiding a second
  cursor source and event loop.

## Testing

### Pure tests

- nearest focused/reference samples and a bounded preceding trail;
- symmetric 0.5 G scale calculation with a 1.5 G minimum;
- 2D option contains rings, focused circle, reference diamond, and trail;
- 3D option contains equal axes, origin-to-vector lines, points, and trail;
- missing reference and missing focused samples;
- default, persisted, missing, and invalid preference modes.

### Component tests

- dashboard now contains Speed, Delta-T, and one acceleration vector panel;
- Speed/Delta hover and keyboard changes update vector values;
- 2D is the default and 3D selection calls the controlled preference callback;
- switching mode preserves cursor and shared Speed/Delta zoom;
- missing sensor and missing reference states remain usable;
- localized device-axis and gravity warning remains visible.

### Browser and supplied-VTA QA

Using `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`, load Inje
Speedium Lap Analysis, select two laps, hover Speed and Delta-T, and confirm the
same cursor position on the map, track inset, and G-G point. Switch to 3D,
rotate the view, then return to 2D and confirm mode persistence after reload.
Repeat on a section scope and a narrow viewport. No VTA content leaves the
browser.

## Deployment Gate

Run focused tests, TypeScript, ESLint, all Vitest tests, production build, and
the complete browser suite. After pushing `main`, monitor CI and GitHub Pages
to success, then repeat the supplied-VTA smoke flow on the cache-busted
production URL with Aside and confirm no page or console errors.
