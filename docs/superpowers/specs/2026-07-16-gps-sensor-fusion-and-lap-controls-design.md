# GPS–Sensor Alignment and Lap Workbench Reliability Design

## Goal

Make the Lap Analysis workbench trustworthy for the supplied legacy VTA by:

- aligning its 1 Hz GPS fixes and high-rate sensor rows on the best clock the
  file actually provides;
- keeping the comparison map limited to the focused and reference laps;
- making focused/reference roles distinct whenever at least two usable laps
  exist;
- removing or repairing map and chart controls that currently appear to work
  but have no observable effect;
- preserving the browser-only, zero-backend workflow and all export contracts.

The validation recording is
`/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`. It is used only for
local QA and is never copied into the repository.

## Evidence from the supplied recording

The file contains 1,589 raw GPS fixes and 158,289 sensor rows. GPS is nominally
1 Hz, with a small number of 2–7 second gaps. Sensor rows average about 99 rows
per second, but repeated sensor elapsed times reduce the unique effective rate
to about 66 Hz.

The legacy rows do not contain `Location.elapsedRealtimeNanos` or
`SensorEvent.timestamp`. They do preserve:

- GPS UTC timestamps at one-second resolution;
- sensor `elapsedSeconds` with millisecond precision;
- original interleaved VTA line order.

Consequently, exact timestamp fusion is impossible for this recording. The
current row-number interpolation uses both streams, but treats irregular sensor
row density as time. This design replaces that fallback with an inferred sensor
clock while retaining an explicitly lower-quality row-order fallback for files
that cannot support it.

## Chosen approach

### Modern recordings: shared monotonic timestamps

When all usable GPS anchors contain `elapsedRealtimeNanos` and sensor rows
contain `timestampNanos`, interpolation continues on that shared monotonic
clock. This is the highest-confidence path.

### Legacy recordings: sensor-clock anchors

For each GPS fix, find the nearest sensor row before and after its original VTA
line. Interpolate `sensor.elapsedSeconds` at the GPS line. A resampled trajectory
anchor between two GPS fixes then interpolates between their inferred sensor
clock values.

Sensor samples are mapped to distance and lap elapsed time using their actual
`elapsedSeconds`, not the number of rows between GPS fixes. This preserves
irregular cadence and GPS gaps without pretending that acceleration can safely
dead-reckon position.

The method is reported as `sensor-clock`. If fewer than two monotonic inferred
anchors remain, the adapter falls back to the existing `line-order` method.
Consecutive duplicate effective sensor instants remain coalesced by averaging
X/Y/Z.

### Position and speed interpolation

Lap comparison remains on the existing five-metre distance grid. Between 1 Hz
GPS fixes, distance, lap time, speed, latitude, and longitude remain bounded
linear interpolations. This is deliberately conservative for the supplied file:
it has no gyro, shared monotonic GPS time, mounting calibration, or reliable
vehicle-frame axes. Cubic/PCHIP or inertial dead reckoning must not invent path
detail unsupported by the recording.

A later modern-VTA phase may add shape-preserving speed interpolation and an
INS/EKF only after the logger provides shared monotonic timestamps, gyroscope,
rotation vector, sensor accuracy, and a device-to-vehicle calibration contract.

## Comparison-lap model

The workbench exposes two separate concepts:

- `visibleLapIds`: presentation rows used by telemetry, variation, and the lap
  table (`all`, `focus-reference`, or `focus-only`);
- focused/reference comparison roles: the only two paths the map may render.

`SegmentTrajectoryMap` derives overlays directly from the focused and reference
IDs and ignores presentation visibility. It never receives an arbitrary overlay
list. Duplicate IDs collapse to one only when the session has a single usable
lap.

Selecting the current reference as the new focus swaps the previous focus into
the reference role when eligible. Selecting the current focus as the new
reference swaps the old reference into focus. If a swap target is not eligible,
the nearest valid alternate is selected. With two or more records, the derived
roles must remain distinct.

The map hides the all-session base route and uses only the focused lap as its
invisible hit target. The two visible comparison overlays therefore cannot be
confused with an underlying multi-lap trace, and overlapping clicks resolve to
the focused lap's source indexes.

## Control capability contract

`RouteMap` treats segment editing and region creation as optional capabilities.
Controls are rendered only when their callbacks exist.

- Overview supplies both capabilities and keeps the full toolbar.
- Lap setup supplies segment editing but no region callback, so `Create region`
  is absent rather than enabled and inert.
- The comparison map supplies segment editing but no region creation.
- Whole-lap scope passes no visible selected segment to the map, so `Clear
  segment` is disabled until a section or custom range is active.

Telemetry Reset performs two actions atomically:

1. restore workbench scope to Whole lap;
2. clear ECharts brush selection and restore every linked data-zoom axis to
   0–100 percent.

## Data contract

```ts
export type SensorSynchronizationMethod =
  | "timestamp"
  | "sensor-clock"
  | "line-order";
```

No parsed source row or export schema changes. `sensor-clock` is presentation
metadata on the in-memory synchronized series only.

## Failure and quality behavior

- Missing sensors keep GPS speed and Delta-T functional.
- Non-monotonic or unbracketed inferred anchors are discarded.
- Fewer than two sensor-clock anchors trigger row-order fallback.
- Samples outside focused trajectory anchors are dropped rather than
  extrapolated.
- GPS gaps remain visible in lap validity/confidence; IMU does not fill them as
  synthetic positions.
- One-lap sessions may show one path and one role; multi-lap sessions keep roles
  distinct.

## Acceptance criteria

- The supplied VTA reports `sensor-clock` synchronization and a nonzero IMU
  sample count.
- A sensor halfway in sensor elapsed time maps halfway between trajectory
  anchors even when row density is asymmetric.
- `Visible laps: All` may expand charts and tables but the map publishes no more
  than focused/reference overlays.
- The all-session base route is hidden in the comparison map.
- Map hit targets contain only focused-lap points and emit original GPS source
  indexes.
- Focus and reference cannot silently become the same lap when alternatives
  exist.
- Unsupported region controls are not rendered.
- Whole-lap `Clear segment` is disabled.
- Telemetry Reset restores both workbench scope and ECharts zoom/brush state.
- Unit, component, integration, build, and Aside QA pass before deployment.

## Local verification evidence

Validated on 2026-07-16 with the supplied legacy recording without copying it
into the repository:

- parser UI: 1,589 GPS fixes and 158,289 sensor rows;
- Inje Speedium preset: focused Lap 7 and reference Lap 4;
- synchronized telemetry: `sensor-clock`, 9,922 effective IMU samples for the
  focused whole-lap trajectory;
- `Visible laps: All`: nine lap/partial rows and all telemetry lap series, while
  the comparison-map legend and rendered paths remain focused/reference only;
- selecting the focused lap as reference swaps the two roles instead of
  producing a zero-delta self-comparison;
- unsupported region creation is absent and Whole-lap clear is disabled;
- a 500–1,000 m custom range enables Clear, and telemetry Reset returns to
  Whole lap and disables Clear again;
- no browser console or page errors occurred during those interactions.
