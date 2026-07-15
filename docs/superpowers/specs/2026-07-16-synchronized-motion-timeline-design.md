# Synchronized Motion Timeline MVP Design

## Goal

Add a deliberately small vehicle-motion MVP to the existing Segment Analysis
Workbench. The focused lap shows measured IMU acceleration next to speed and
Delta-T, and one shared cursor keeps the telemetry chart, map selection, and
ghost markers on the same source point. When the floating analysis controls are
open on desktop, the workbench yields horizontal space instead of being covered.

The product remains a zero-backend GitHub Pages app. The supplied VTA file is a
local verification input and must never be committed.

## Why this is the first step

The MathWorks evaluation-tool research showed that the useful pattern is not a
large collection of charts. It is a linked evaluation surface where a selected
time or sequence identifies the same state in the trajectory, graphs, and
tables. OpenVTA already has a map, a distance/time telemetry chart, lap scopes,
and a selected GPS point. This MVP connects those existing primitives and adds
the measured acceleration channels already present in VTA sensor rows.

This design intentionally does not claim that phone axes are vehicle
longitudinal, lateral, and vertical axes. The first release labels the channels
as IMU X, Y, and Z and shows whether synchronization used monotonic timestamps
or VTA row order.

## Scope

### Included

- Pass the active transformed sensor stream into Lap Analysis and the Segment
  Analysis Workbench.
- Synchronize IMU rows to the focused lap trajectory.
- Prefer `timestampNanos`/`elapsedRealtimeNanos` when both streams contain them.
- Fall back to interpolation by original VTA `lineNumber` for legacy files.
- Coalesce duplicate sensor timestamps by averaging acceleration channels.
- Convert acceleration to `g` without rotating or renaming device axes.
- Add an `IMU acceleration` band with X, Y, and Z series to the existing
  telemetry widget.
- Keep speed, Delta-T, and IMU acceleration visible in the compact view.
- Keep the existing GPS-speed-derivative channel in the advanced view with a
  distinct label.
- Make the selected telemetry source index controlled by the workbench.
- A map selection moves the chart cursor and ghost markers.
- A chart hover/click moves the selected map point and ghost markers.
- Show a compact synchronization badge and sample count.
- On desktop, opening the floating control drawer adds left inset to the
  workbench; on narrow screens it remains an overlay with a scrim.
- Preserve the remembered drawer state and existing dashboard layout.

### Excluded

- Device-to-vehicle coordinate rotation.
- Gravity compensation beyond the existing calibration/filter pipeline.
- Gyroscope, yaw-rate, CAN, steering, brake, throttle, RPM, and wheel-speed
  channels.
- ADE/FDE, detection/tracking objects, and ground-truth terminology.
- A new dashboard widget or new widget preference.
- Changes to VTA export schemas.
- Changes to `openvta-live` or the Android logger.

## Data contract

The domain layer adds a focused, presentation-independent result:

```ts
export type SensorSynchronizationMethod = "timestamp" | "line-order";

export interface SynchronizedAccelerationSample {
  sensorIndex: number;
  sourceIndex: number;
  distanceMeters: number;
  elapsedSeconds: number;
  accelXG: number;
  accelYG: number;
  accelZG: number;
}

export interface SynchronizedAccelerationSeries {
  method: SensorSynchronizationMethod;
  samples: SynchronizedAccelerationSample[];
}
```

`synchronizeAccelerationToTrajectory(points, sensors, trajectory)` returns no
series when any input is empty or there are fewer than two usable trajectory
anchors. It never mutates parsed source rows.

### Timestamp synchronization

When the selected GPS anchors contain `elapsedRealtimeNanos` and sensor rows
contain `timestampNanos`, each sensor timestamp is interpolated between adjacent
GPS monotonic timestamps. The interpolated source index is rounded only for map
selection; chart distance and elapsed time remain interpolated floats.

### Legacy line-order synchronization

For legacy phone recordings, GPS and IMU rows retain their original VTA line
numbers. A sensor row is located between adjacent GPS rows in file order. That
fraction is applied between the corresponding trajectory anchors. Samples
outside the focused scope are dropped.

The UI must call this `row-order sync`, not exact timestamp synchronization.

### Duplicate timestamps

Consecutive sensor rows with the same sensor elapsed time and mapped source
index are grouped. X/Y/Z are averaged so ECharts receives one deterministic
sample per effective instant.

## Shared cursor

`SegmentAnalysisWorkbench` owns `cursorDistanceMeters`. The current
`selectedPointIndex` remains the application-wide source-point contract.

- When `selectedPointIndex` changes, the workbench finds the focused trajectory
  sample with the nearest `sourceIndex` and updates `cursorDistanceMeters`.
- When a telemetry point emits a source index, the workbench updates both
  `selectedPointIndex` and `cursorDistanceMeters`.
- The trajectory map continues to receive `selectedPointIndex` and
  `cursorDistanceMeters`, so the route selection and focused/reference ghost
  markers move together.
- The telemetry option receives the controlled cursor coordinate and renders a
  vertical cursor marker on every visible band.

This is one-way state ownership rather than map and chart components attempting
to synchronize each other directly.

## Telemetry presentation

The compact telemetry view contains:

1. focused/reference speed;
2. focused-lap IMU X/Y/Z acceleration in `g`;
3. focused/reference Delta-T.

Advanced mode additionally contains GPS speed derivative, elapsed time, and
loss rate. The IMU series has stable colors that do not imply vehicle axes:

- X: violet;
- Y: teal;
- Z: amber.

The caption shows the cursor distance, focused/reference speed and Delta-T,
IMU sample count, and synchronization method. If no sensors can be synchronized,
the graph remains functional and displays a non-blocking `IMU unavailable`
message.

## Floating drawer layout

The drawer stays `position: fixed`. On viewports wider than 1180 px the
workbench applies an animated left inset equal to the drawer width plus spacing
while `preferences.drawerOpen` is true. The right edge stays fixed, so the
dashboard becomes narrower and React Grid Layout recalculates its responsive
width.

At 1180 px and below the workbench receives no inset. At 680 px and below the
existing scrim and full-width drawer behavior remain unchanged. Reduced-motion
users receive no layout transition.

## Error and quality behavior

- Missing sensors: speed/Delta-T continue to render.
- Unusable timestamps: fall back to line order when line anchors exist.
- No usable timestamp or line anchors: report IMU unavailable.
- Mixed acceleration units: normalize each row independently to `g`.
- Zero-length or reversed anchors: discard that sample rather than extrapolate.
- A selected source point outside the focused scope clamps to the nearest
  focused trajectory sample.

## Testing

- Domain tests cover timestamp synchronization, line-order fallback, duplicate
  coalescing, unit conversion, and empty input.
- Telemetry option tests prove X/Y/Z series, controlled cursor marker, and
  speed/Delta retention.
- Component tests prove map-to-chart and chart-to-map callbacks use the same
  source index.
- Workbench tests prove the open class follows the remembered drawer state.
- Browser tests prove desktop drawer push, mobile overlay, and linked cursor.
- Final manual QA uses
  `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta` without copying it into
  the repository.

## Acceptance criteria

- The provided VTA shows measured IMU X/Y/Z in the telemetry widget.
- Its legacy data is labeled `row-order sync` and reports a nonzero effective
  sample count.
- Moving the telemetry cursor changes the selected map point.
- Selecting a map point changes the telemetry cursor and both ghost markers.
- Selecting a track section limits IMU samples to that focused scope.
- Opening analysis controls on desktop visibly shifts and narrows the workbench.
- Mobile retains the overlay drawer with no horizontal overflow.
- Existing lap analysis, exports, preferences, and dashboard drag/resize remain
  compatible.

## Deferred vehicle-motion roadmap

After this MVP is validated, future work can proceed as independent designs:

1. device-mount calibration and vehicle-frame longitudinal/lateral/vertical
   acceleration;
2. gravity compensation, jerk, G-G diagrams, and signal-quality diagnostics;
3. corner entry/apex/exit dynamics summaries and lap-to-lap RMS/P95 residuals;
4. a newer VTA schema with shared monotonic timestamps, gyroscope, rotation
   vector, sensor accuracy, and optional CAN channels;
5. a separate truth/prediction import contract for autonomous-algorithm
   evaluation, ADE/FDE, and detection/tracking metrics.

These deferred items must not be implemented by extending this MVP implicitly.
