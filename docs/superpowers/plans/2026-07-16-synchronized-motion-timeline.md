# Synchronized Motion Timeline MVP Implementation Plan

> **Historical plan:** This records the first row-order implementation. Its
> legacy synchronization and lap-workbench behavior are superseded by
> [GPS–Sensor Alignment and Lap Workbench Reliability](./2026-07-16-gps-sensor-fusion-and-lap-controls.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add measured IMU X/Y/Z acceleration and one map/chart cursor to the Segment Analysis Workbench, while making the open floating controls reserve desktop layout space.

**Architecture:** A pure domain adapter synchronizes sensor rows to the focused lap trajectory using monotonic timestamps when available and VTA row order otherwise. `SegmentAnalysisWorkbench` owns the shared cursor and passes synchronized samples into the existing telemetry widget. Drawer-open state adds a desktop-only workbench inset; mobile keeps the current overlay behavior.

**Tech Stack:** React 18, TypeScript, ECharts 5, MapLibre, React Grid Layout, Vitest, Testing Library, Playwright, Vite.

---

### Task 1: Synchronize acceleration rows to a focused trajectory

**Files:**
- Create: `src/domain/sensorSynchronization.ts`
- Create: `src/domain/__tests__/sensorSynchronization.test.ts`
- Modify: `src/domain/types.ts`

- [x] **Step 1: Add the synchronization result types**

Add to `src/domain/types.ts`:

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

- [x] **Step 2: Write failing domain tests**

Cover these concrete cases in `sensorSynchronization.test.ts`:

```ts
it("interpolates sensors by monotonic timestamp when both streams provide nanos", () => {
  const result = synchronizeAccelerationToTrajectory(pointsWithNanos(), sensorsWithNanos(), trajectory());
  expect(result?.method).toBe("timestamp");
  expect(result?.samples[0]).toMatchObject({ distanceMeters: 50, elapsedSeconds: 5, sourceIndex: 1 });
});

it("falls back to VTA line order and converts mps2 to g", () => {
  const result = synchronizeAccelerationToTrajectory(pointsByLine(), sensorsByLine(), trajectory());
  expect(result?.method).toBe("line-order");
  expect(result?.samples[0].accelXG).toBeCloseTo(1);
});

it("coalesces duplicate effective sensor instants by averaging channels", () => {
  const result = synchronizeAccelerationToTrajectory(pointsByLine(), duplicateSensors(), trajectory());
  expect(result?.samples).toHaveLength(1);
  expect(result?.samples[0].accelXG).toBeCloseTo(0.5);
});

it("drops samples outside the trajectory scope and returns undefined without anchors", () => {
  expect(synchronizeAccelerationToTrajectory([], sensorsByLine(), [])).toBeUndefined();
});
```

- [x] **Step 3: Run the focused test and confirm failure**

Run:

```bash
corepack pnpm vitest run src/domain/__tests__/sensorSynchronization.test.ts
```

Expected: FAIL because `synchronizeAccelerationToTrajectory` and the result types do not exist.

- [x] **Step 4: Implement the pure adapter**

Create `src/domain/sensorSynchronization.ts` with this public contract:

```ts
import { GRAVITY_MPS2, type GpsPoint, type SegmentTrajectorySample, type SensorPoint,
  type SynchronizedAccelerationSample, type SynchronizedAccelerationSeries } from "./types";

export function synchronizeAccelerationToTrajectory(
  points: GpsPoint[],
  sensors: SensorPoint[],
  trajectory: SegmentTrajectorySample[],
): SynchronizedAccelerationSeries | undefined;
```

Implementation requirements:

1. Build unique trajectory anchors sorted by `sourceIndex`.
2. Resolve each anchor to its source `GpsPoint`.
3. Use monotonic nanos only when every usable anchor and at least one sensor has
   the timestamp field; otherwise use line number.
4. Advance through ordered anchors in O(points + sensors) time.
5. Interpolate `distanceMeters` and `elapsedSeconds` between anchors.
6. Normalize each acceleration value with
   `unit === "g" ? value : value / GRAVITY_MPS2`.
7. Group consecutive samples with equal `sensor.elapsedSeconds` and mapped
   `sourceIndex`, average X/Y/Z, and retain the first sensor index.
8. Return `undefined` when fewer than two anchors or zero synchronized samples
   remain.

- [x] **Step 5: Run the focused domain test**

Run the command from Step 3.

Expected: PASS.

- [x] **Step 6: Commit the domain unit**

```bash
git add src/domain/types.ts src/domain/sensorSynchronization.ts src/domain/__tests__/sensorSynchronization.test.ts
git commit -m "feat: synchronize IMU acceleration to lap trajectories"
```

### Task 2: Pass the active sensor pipeline into Lap Analysis

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/components/LapAnalysis.tsx`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/__tests__/LapAnalysis.test.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`

- [x] **Step 1: Write failing prop-flow tests**

Update the Lap Analysis test fixture with one `SensorPoint`, render it, and
assert the workbench exposes an `IMU acceleration` status after Task 3. Add a
workbench test that renders `sensors={[]}` and proves the rest of the workbench
still renders.

- [x] **Step 2: Run the component tests and confirm failure**

```bash
corepack pnpm vitest run src/components/__tests__/LapAnalysis.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
```

Expected: FAIL because these components do not accept `sensors`.

- [x] **Step 3: Add explicit sensor props**

Add `sensors: SensorPoint[]` to `LapAnalysisProps` and
`SegmentAnalysisWorkbenchProps`. In `App.tsx`, pass `chartSensors` to
`LapAnalysis`, so the currently selected Raw/Calibrated/Filtered transform is
the one used by the workbench. Forward the prop unchanged to
`SegmentAnalysisWorkbench`.

- [x] **Step 4: Run the component tests**

Run the Step 2 command.

Expected: tests compile; the future IMU status assertion remains red until
Task 3, while the empty-sensor compatibility assertion passes.

### Task 3: Add measured IMU channels to the existing telemetry widget

**Files:**
- Modify: `src/components/SegmentTelemetryChart.tsx`
- Modify: `src/components/segmentTelemetryOptions.ts`
- Modify: `src/components/__tests__/SegmentTelemetryChart.test.tsx`
- Modify: `src/i18n/lapLocales.ts`

- [x] **Step 1: Write failing option tests**

Extend `SegmentTelemetryChart.test.tsx` to pass a synchronized series with X/Y/Z
values. Assert the rendered ECharts option contains series IDs
`imu-acceleration-x`, `imu-acceleration-y`, and `imu-acceleration-z`, and that
the compact metrics still contain speed and Delta-T.

Also assert that `cursorDistanceMeters={25}` produces a vertical cursor mark at
25 metres on each visible grid.

- [x] **Step 2: Run the telemetry tests and confirm failure**

```bash
corepack pnpm vitest run src/components/__tests__/SegmentTelemetryChart.test.tsx
```

Expected: FAIL because synchronized samples and controlled cursor props are not
accepted.

- [x] **Step 3: Extend the telemetry option contract**

Add these inputs to `buildSegmentTelemetryOption`:

```ts
synchronizedAcceleration: SynchronizedAccelerationSeries | undefined,
cursorDistanceMeters: number | undefined,
```

Add metric key `imu-acceleration`. Compact mode becomes:

```ts
["speed", "imu-acceleration", "delta"]
```

Advanced mode becomes:

```ts
["speed", "imu-acceleration", "acceleration", "elapsed", "delta", "loss"]
```

For the IMU grid, create three focused-only line series using the synchronized
sample's distance or elapsed value and its source index as the third tuple
coordinate. Add a cursor mark line to the first series on every grid. Rename the
existing derivative label to `GPS speed derivative` and keep unit `g (GPS)`.

- [x] **Step 4: Make the component cursor controlled**

Replace the local cursor state in `SegmentTelemetryChart` with props:

```ts
cursorDistanceMeters?: number;
synchronizedAcceleration?: SynchronizedAccelerationSeries;
onCursor: (distanceMeters: number, sourceIndex: number) => void;
```

`selectPoint` must locate the nearest focused trajectory sample and call
`onCursor(sample.distanceMeters, sample.sourceIndex)`. The caption reports
sample count and `timestamp` or `row-order` method; no synchronized series
reports `IMU unavailable` without hiding speed/Delta.

- [x] **Step 5: Add localized copy**

Add source-of-truth English keys and Korean translations for:

```text
lap.workbench.imuAcceleration
lap.workbench.imuAxisX
lap.workbench.imuAxisY
lap.workbench.imuAxisZ
lap.workbench.imuTimestampSync
lap.workbench.imuLineOrderSync
lap.workbench.imuUnavailable
lap.workbench.imuSampleCount
```

Populate the remaining locale objects with concise English fallback values to
keep their key contracts complete.

- [x] **Step 6: Run telemetry and i18n tests**

```bash
corepack pnpm vitest run src/components/__tests__/SegmentTelemetryChart.test.tsx src/i18n/__tests__/i18n.test.ts
```

Expected: PASS.

### Task 4: Make map, chart, and ghost markers share one cursor

**Files:**
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/SegmentTelemetryChart.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Modify: `src/components/__tests__/SegmentTelemetryChart.test.tsx`

- [x] **Step 1: Write failing synchronization tests**

In the workbench test, select a point through the mocked map callback and assert
the telemetry receives the corresponding controlled distance. Trigger the
telemetry `onCursor` callback and assert `onSelectedPointIndex` receives the same
source index.

- [x] **Step 2: Run the focused tests and confirm failure**

```bash
corepack pnpm vitest run src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/components/__tests__/SegmentTelemetryChart.test.tsx
```

Expected: FAIL because the telemetry owns its cursor locally.

- [x] **Step 3: Centralize cursor state**

In `SegmentAnalysisWorkbench`:

1. Derive `synchronizedAcceleration` with `useMemo` from `points`, `sensors`,
   and `focused?.trajectory`.
2. Add an effect that maps `selectedPointIndex` to the nearest focused
   trajectory source index and updates `cursorDistanceMeters`.
3. Add `selectWorkbenchCursor(distanceMeters, sourceIndex)` that sets both the
   local distance and application `onSelectedPointIndex`.
4. Pass controlled distance, synchronized series, and callback to telemetry.
5. Keep passing controlled distance to `SegmentTrajectoryMap`.

- [x] **Step 4: Run focused tests**

Run the Step 2 command.

Expected: PASS.

- [x] **Step 5: Commit prop flow, telemetry, and cursor work**

```bash
git add src/app/App.tsx src/components src/i18n/lapLocales.ts
git commit -m "feat: add synchronized IMU timeline to lap analysis"
```

### Task 5: Shift the desktop workbench when controls are open

**Files:**
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/styles.css`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Modify: `tests/analyzer.spec.ts`

- [x] **Step 1: Write failing layout tests**

Assert the workbench root has `is-controls-open` when the remembered preference
opens the drawer and loses it after the close callback. In E2E, open the drawer
at desktop width and assert the workbench content left bound increases while its
right bound remains within two pixels; at mobile width assert the left bound is
unchanged and the scrim is visible.

- [x] **Step 2: Run focused tests and confirm failure**

```bash
corepack pnpm vitest run src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
```

Expected: FAIL because the root does not expose drawer state.

- [x] **Step 3: Add the state class and desktop inset**

Render the workbench root as:

```tsx
<section className={`segment-workbench lap-wide-panel${preferences.drawerOpen ? " is-controls-open" : ""}`}>
```

Add CSS:

```css
@media (min-width: 1181px) {
  .segment-workbench {
    --segment-controls-reserved-space: 0px;
    padding-left: var(--segment-controls-reserved-space);
    transition: padding-left 180ms ease;
  }

  .segment-workbench.is-controls-open {
    --segment-controls-reserved-space: min(426px, calc(100vw - 720px));
  }
}
```

Under `prefers-reduced-motion: reduce`, disable this transition. Do not change
the mobile drawer or scrim rules.

- [x] **Step 4: Run component and browser tests**

```bash
corepack pnpm vitest run src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
corepack pnpm test:e2e
```

Expected: PASS on desktop and mobile projects.

- [x] **Step 5: Commit the drawer layout change**

```bash
git add src/components/SegmentAnalysisWorkbench.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/styles.css tests/analyzer.spec.ts
git commit -m "feat: reserve workspace for open analysis controls"
```

### Task 6: Full verification and actual VTA QA

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-synchronized-motion-timeline.md`

- [x] **Step 1: Run all repository gates**

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 2: Verify the supplied VTA with Aside**

At desktop width, load
`/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`, open Lap Analysis, and
verify:

- Inje Speedium preset matches;
- IMU X/Y/Z series and a nonzero sample count render;
- synchronization is labeled row-order;
- chart movement updates the map point and ghost marker;
- map point selection updates the chart cursor;
- Corner 5 limits the timeline;
- opening controls moves the workbench right without overflow.

Repeat a smoke check at mobile width and confirm the drawer overlays with a
scrim rather than pushing content.

- [x] **Step 3: Mark plan steps complete and review the diff**

Run:

```bash
git status --short
git diff --stat HEAD~3..HEAD
git log --oneline -6
```

Confirm no `.Vta`, screenshots, build artifacts, or test output are staged.

### Task 7: Integrate and deploy

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-synchronized-motion-timeline.md`

- [x] **Step 1: Commit the design and plan documents if not already committed**

```bash
git add docs/superpowers/specs/2026-07-16-synchronized-motion-timeline-design.md docs/superpowers/plans/2026-07-16-synchronized-motion-timeline.md
git commit -m "docs: plan synchronized motion timeline"
```

- [x] **Step 2: Push `main` without force**

```bash
git fetch origin main
git push origin main
```

Expected: local and `origin/main` resolve to the same commit.

- [x] **Step 3: Monitor CI and Pages**

Use `gh run list` and `gh run view` for the pushed commit. Both `CI` and
`Deploy Pages` must complete with `success`.

- [x] **Step 4: Smoke-test production**

Open `https://woo4826.github.io/openvta-analyzer/` with Aside, load the supplied
VTA locally, and confirm the IMU timeline and drawer-push behavior are present.

## Implementation notes

- `sourcePosition` was added as an internal fractional GPS anchor so narrow,
  resampled corners remain synchronizable even when adjacent display points
  share one integer source index. Schema-v1 segment JSON strips this internal
  field before export.
- Rendering uses at most 2,400 IMU points while preserving the first/last
  samples and per-bucket X/Y/Z extrema. The synchronization status continues to
  report the full effective sample count.
- The shared chart cursor is a reused zrender overlay, not a static series
  mark-line. Cursor movement therefore does not rebuild the full ECharts option.
  All distance/time grids share one explicit X domain so the cursor remains
  geometrically aligned.
- Actual-file desktop QA used Aside MCP with
  `VTA24082025_101142_CC00.Vta`: Inje Speedium matched, Lap 7 synchronized 9,958
  row-order IMU samples, cursor movement updated the 3,915 m lap position, and
  distance/time modes rendered without browser errors. Mobile drawer behavior
  was covered by the repository mobile E2E project because the attached Aside
  tab does not expose viewport resizing.
- Final pre-deploy gates: TypeScript and ESLint passed; Vitest passed 271 tests;
  production build passed; desktop/mobile E2E passed 16 tests; `git diff
  --check` passed. Independent review reported no Critical or Important blocker.
- Commit `4823c98` passed CI run `29428827148` and Deploy Pages run
  `29428826994`. Production Aside MCP QA loaded the supplied VTA, matched Inje
  Speedium, rendered 9,958 row-order IMU samples, moved the synchronized cursor
  to 2,090 m, and measured an exact 426 px desktop workbench shift with an
  unchanged right edge.
