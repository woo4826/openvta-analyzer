# Cursor Acceleration Vector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rightmost raw X/Y/Z acceleration line chart with a cursor-synchronized 2D G-G diagram and an optional lazy-loaded 3D acceleration sphere, then deploy the result to GitHub Pages.

**Architecture:** `SegmentTelemetryChart` keeps the one distance-based cursor and the two brushable Speed/Delta-T charts. A new controlled `SegmentAccelerationVectorPanel` consumes focused/reference synchronized IMU series at that cursor, while pure helpers build the 2D and 3D ECharts options. The existing preference store remembers `gg-2d` or `vector-3d`; ECharts-GL is loaded only when 3D is selected.

**Tech Stack:** React 18, TypeScript, Apache ECharts 5, ECharts-GL 2, Vitest/Testing Library, Vite, Aside, GitHub Actions/Pages

---

## File map

- Create `src/components/accelerationVectorOptions.ts`: nearest-sample/trail/range helpers and pure 2D/3D option builders.
- Create `src/components/SegmentAccelerationVectorPanel.tsx`: controlled 2D/3D panel, lazy ECharts-GL registration, numeric fallback, and unavailable states.
- Create `src/types/echarts-gl.d.ts`: side-effect module declaration for the lazy import.
- Create `src/components/__tests__/accelerationVectorOptions.test.ts`: pure vector and chart-semantics tests.
- Create `src/components/__tests__/SegmentAccelerationVectorPanel.test.tsx`: mode, numeric readout, and empty-state tests.
- Modify `src/domain/types.ts`: add `AccelerationVectorMode` and the saved preference field.
- Modify `src/domain/segmentWorkbenchPreferences.ts`: default and validation for the mode.
- Modify `src/domain/__tests__/segmentWorkbenchPreferences.test.ts`: default, round-trip, missing, and invalid mode coverage.
- Modify `src/components/SegmentTelemetryChart.tsx`: render Speed, Delta-T, and the vector panel; keep cursor and shared zoom centralized.
- Modify `src/components/segmentTelemetryOptions.ts`: remove measured-acceleration line construction from the dashboard option builder.
- Modify `src/components/SegmentAnalysisWorkbench.tsx`: bind the controlled vector mode to preferences.
- Modify related component tests and `src/i18n/lapLocales.ts`.
- Modify `src/styles.css`: square G-G plot, panel controls, values, responsive layout, loading/error presentation.
- Modify `package.json` and `pnpm-lock.yaml`: add `echarts-gl`.
- Modify this plan: check off tasks and record deployment evidence.

### Task 1: Persist the acceleration-vector mode

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/segmentWorkbenchPreferences.ts`
- Test: `src/domain/__tests__/segmentWorkbenchPreferences.test.ts`

- [ ] **Step 1: Write failing preference tests**

Add assertions that the default is 2D, `vector-3d` round-trips, an older v2 object without the field migrates to 2D, and an invalid value falls back to 2D:

```ts
expect(defaultSegmentWorkbenchPreferences().accelerationVectorMode).toBe("gg-2d");
preferences.accelerationVectorMode = "vector-3d";
expect(loadSegmentWorkbenchPreferences(storage).accelerationVectorMode).toBe("vector-3d");
expect(loadSegmentWorkbenchPreferences(storageWithoutMode).accelerationVectorMode).toBe("gg-2d");
expect(loadSegmentWorkbenchPreferences(storageWithInvalidMode).accelerationVectorMode).toBe("gg-2d");
```

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm test -- src/domain/__tests__/segmentWorkbenchPreferences.test.ts`

Expected: failure because `accelerationVectorMode` does not exist.

- [ ] **Step 3: Add the type, default, and loader validation**

Add:

```ts
export type AccelerationVectorMode = "gg-2d" | "vector-3d";

export interface SegmentWorkbenchPreferences {
  version: 2;
  drawerOpen: boolean;
  lapVisibility: SegmentLapVisibility;
  telemetryLayout: SegmentTelemetryLayout;
  accelerationVectorMode: AccelerationVectorMode;
  snapToSections: boolean;
  visibleWidgets: Record<SegmentWidgetId, boolean>;
  layouts: Record<string, SegmentWidgetLayout[]>;
}
```

Use `const accelerationVectorModes = ["gg-2d", "vector-3d"]` in the loader, default to `gg-2d`, and normalize a missing/invalid saved field without rejecting the entire v2 preference object.

- [ ] **Step 4: Run the focused tests**

Run: `pnpm test -- src/domain/__tests__/segmentWorkbenchPreferences.test.ts`

Expected: all preference tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/segmentWorkbenchPreferences.ts src/domain/__tests__/segmentWorkbenchPreferences.test.ts
git commit -m "feat: persist acceleration vector mode"
```

### Task 2: Build pure cursor-vector data and option helpers

**Files:**
- Create: `src/components/accelerationVectorOptions.ts`
- Create: `src/components/__tests__/accelerationVectorOptions.test.ts`

- [ ] **Step 1: Write failing nearest-sample and option tests**

Test the exact public contract:

```ts
const snapshot = accelerationVectorSnapshot(focused, reference, 50, 2);
expect(snapshot.focused?.distanceMeters).toBe(50);
expect(snapshot.reference?.distanceMeters).toBe(48);
expect(snapshot.focusedTrail.map((sample) => sample.distanceMeters)).toEqual([25, 50]);
expect(accelerationVectorScale(snapshot)).toBe(1.5);

const option2d = buildAccelerationGgOption(snapshot, labels);
expect(seriesIds(option2d)).toEqual(expect.arrayContaining([
  "ring-0.5", "ring-1", "ring-1.5", "focused-trail", "focused-vector",
  "reference-vector", "focused-point", "reference-point",
]));

const option3d = buildAcceleration3dOption(snapshot, labels);
expect(seriesIds(option3d)).toEqual(expect.arrayContaining([
  "unit-sphere", "focused-trail-3d", "focused-vector-3d",
  "reference-vector-3d", "focused-point-3d", "reference-point-3d",
]));
```

Also assert the scale rounds to 0.5 G, the trail never exceeds 25 points, and a missing reference omits its vector/point series.

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm test -- src/components/__tests__/accelerationVectorOptions.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement binary search, local trail, and scale**

Create these interfaces and functions:

```ts
export interface AccelerationVectorSnapshot {
  focused?: SynchronizedAccelerationSample;
  reference?: SynchronizedAccelerationSample;
  focusedTrail: SynchronizedAccelerationSample[];
}

export function accelerationVectorSnapshot(
  focused: SynchronizedAccelerationSeries | undefined,
  reference: SynchronizedAccelerationSeries | undefined,
  cursorDistanceMeters: number,
  trailLength = 25,
): AccelerationVectorSnapshot;

export function accelerationVectorScale(snapshot: AccelerationVectorSnapshot): number;
```

Use a lower-bound binary search on `distanceMeters`, choose the closer adjacent sample, slice the focused samples ending at that index, and calculate `Math.ceil(Math.max(1.5, maxAbs) * 2) / 2`.

- [ ] **Step 4: Implement the ECharts option builders**

Export:

```ts
export function buildAccelerationGgOption(
  snapshot: AccelerationVectorSnapshot,
  labels: AccelerationVectorLabels,
): EChartsOption;

export function buildAcceleration3dOption(
  snapshot: AccelerationVectorSnapshot,
  labels: AccelerationVectorLabels,
): EChartsOption;
```

Generate 0.5 G ring paths up to the symmetric scale, XY trail/vector/points for 2D, and a transparent parametric 1 G sphere plus XYZ trail/vector/points for 3D. Use a filled circle for focused and outlined diamond for reference. Set `animation: false`, equal min/max on every axis, and `silent: true` on structural series.

- [ ] **Step 5: Run the helper tests**

Run: `pnpm test -- src/components/__tests__/accelerationVectorOptions.test.ts`

Expected: all helper tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/accelerationVectorOptions.ts src/components/__tests__/accelerationVectorOptions.test.ts
git commit -m "feat: build acceleration vector chart options"
```

### Task 3: Add the controlled 2D/3D vector panel

**Files:**
- Create: `src/components/SegmentAccelerationVectorPanel.tsx`
- Create: `src/components/__tests__/SegmentAccelerationVectorPanel.test.tsx`
- Create: `src/types/echarts-gl.d.ts`
- Modify: `src/i18n/lapLocales.ts`
- Modify: `src/styles.css`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add ECharts-GL**

Run: `pnpm add echarts-gl@^2.1.0`

Expected: `package.json` and lockfile contain `echarts-gl`.

- [ ] **Step 2: Write failing panel tests**

Mock `ChartPanel`, render the component with focused/reference fixtures, and assert:

```ts
expect(screen.getByRole("button", { name: "2D G-G" })).toHaveAttribute("aria-pressed", "true");
expect(screen.getByText("+0.10 g")).toBeVisible();
expect(screen.getByText("−0.20 g")).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "3D vector" }));
expect(onMode).toHaveBeenCalledWith("vector-3d");
```

Add missing-focused and missing-reference cases. In the missing-focused case the panel must show `Measured acceleration unavailable`; in the missing-reference case it must retain the focused point and report `Reference acceleration unavailable`.

- [ ] **Step 3: Verify the panel tests fail**

Run: `pnpm test -- src/components/__tests__/SegmentAccelerationVectorPanel.test.tsx`

Expected: module-not-found failure.

- [ ] **Step 4: Add localized labels**

Add English and Korean keys for the mode group, 2D/3D labels, titles, ARIA summaries, planar magnitude, local trail, 3D loading/failure, return-to-2D, and missing reference. Update `dragZoomHelp` to say Speed and Delta-T share zoom, because the vector panel is not brushable.

- [ ] **Step 5: Implement the panel and lazy loader**

Use this public interface:

```ts
interface SegmentAccelerationVectorPanelProps {
  focused?: SynchronizedAccelerationSeries;
  reference?: SynchronizedAccelerationSeries;
  cursorDistanceMeters: number;
  mode: AccelerationVectorMode;
  onMode: (mode: AccelerationVectorMode) => void;
  describedBy?: string;
}
```

Build the snapshot with `useMemo`. For 2D, render `ChartPanel` immediately. For 3D, run `import("echarts-gl")` in an effect, mount `ChartPanel` only after registration, catch import/WebGL failure, and always render the textual X/Y/Z/magnitude readout. Declare `module "echarts-gl"` in `src/types/echarts-gl.d.ts`.

- [ ] **Step 6: Style square and responsive views**

Add dedicated styles so the vector canvas remains square and centered, the mode buttons have 44 px targets and visible pressed state, values use a four-column responsive grid, and loading/error content fits both three-column and stacked layouts without overflow.

- [ ] **Step 7: Run panel tests, typecheck, and build**

Run:

```bash
pnpm test -- src/components/__tests__/SegmentAccelerationVectorPanel.test.tsx
pnpm typecheck
pnpm build
```

Expected: all commands pass and Vite emits a separate ECharts-GL chunk.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/types/echarts-gl.d.ts src/i18n/lapLocales.ts src/styles.css src/components/SegmentAccelerationVectorPanel.tsx src/components/__tests__/SegmentAccelerationVectorPanel.test.tsx
git commit -m "feat: add two and three dimensional acceleration panel"
```

### Task 4: Integrate the vector panel with the shared cursor and preferences

**Files:**
- Modify: `src/components/SegmentTelemetryChart.tsx`
- Modify: `src/components/segmentTelemetryOptions.ts`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/__tests__/SegmentTelemetryChart.test.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`

- [ ] **Step 1: Rewrite failing telemetry expectations**

Update the chart mock and assertions so only Speed and Delta-T are domain charts, the third grid item is the vector panel, hover/keyboard on either time-series chart updates the shared distance, and the Delta-T chart owns the visible zoom slider:

```ts
expect(screen.getAllByTestId("segment-chart")).toHaveLength(2);
expect(screen.getByTestId("acceleration-vector-panel")).toBeVisible();
for (const title of ["Speed", "Delta-T"]) {
  fireEvent.click(screen.getByRole("button", { name: `Hover ${title}` }));
  expect(onCursor).toHaveBeenLastCalledWith(50, 21);
}
expect(chartOption("Delta-T").dataZoom).toEqual(expect.arrayContaining([
  expect.objectContaining({ type: "slider" }),
]));
```

In the workbench test mock, expose `accelerationVectorMode` and `onAccelerationVectorMode`, then assert 3D selection is persisted.

- [ ] **Step 2: Verify the integration tests fail**

Run:

```bash
pnpm test -- src/components/__tests__/SegmentTelemetryChart.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
```

Expected: failures because the existing third line chart and props remain.

- [ ] **Step 3: Replace the third chart and simplify option construction**

Change the telemetry metric list to:

```ts
const CORE_METRICS = ["speed", "delta"] as const;
```

Build only these two options, give Delta-T the shared zoom slider, and append:

```tsx
<div className="segment-telemetry-metric-card is-acceleration-vector">
  <SegmentAccelerationVectorPanel
    focused={focusedAcceleration}
    reference={referenceAcceleration}
    cursorDistanceMeters={cursorDistanceMeters}
    mode={accelerationVectorMode}
    onMode={onAccelerationVectorMode}
    describedBy={interpretationId}
  />
</div>
```

Remove measured-acceleration series generation and downsampling from `segmentTelemetryOptions.ts`; retain Speed/Delta sign semantics and common scope domain.

- [ ] **Step 4: Bind the saved preference in the workbench**

Pass:

```tsx
accelerationVectorMode={preferences.accelerationVectorMode}
onAccelerationVectorMode={(accelerationVectorMode) =>
  updatePreferences((current) => ({ ...current, accelerationVectorMode }))}
```

Update the test mock type and add a button that selects `vector-3d`.

- [ ] **Step 5: Run integration and preference tests**

Run:

```bash
pnpm test -- src/components/__tests__/SegmentTelemetryChart.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/domain/__tests__/segmentWorkbenchPreferences.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/SegmentTelemetryChart.tsx src/components/segmentTelemetryOptions.ts src/components/SegmentAnalysisWorkbench.tsx src/components/__tests__/SegmentTelemetryChart.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
git commit -m "feat: synchronize cursor acceleration vector"
```

### Task 5: Verify with the supplied VTA and harden edge cases

**Files:**
- Review and harden: `src/components/SegmentAccelerationVectorPanel.tsx`
- Review and harden: `src/components/accelerationVectorOptions.ts`
- Review and harden: `src/components/SegmentTelemetryChart.tsx`
- Review and harden: `src/styles.css`
- Modify: `docs/superpowers/plans/2026-07-16-cursor-acceleration-vector.md`

- [ ] **Step 1: Run the complete local quality gate**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
git diff --check
```

Expected: zero TypeScript/ESLint errors, all Vitest and browser tests pass, production build succeeds, and the diff has no whitespace errors.

- [ ] **Step 2: Start the local app and inspect it with Aside**

Run `pnpm dev`, attach Aside to `http://127.0.0.1:5173/`, and import `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta` through the visible file input.

Expected: 1,589 GPS fixes, 158,289 sensor rows, Inje Speedium match, and synchronized measured acceleration in Lap Analysis.

- [ ] **Step 3: Exercise the complete cursor-vector flow**

On whole lap and one corner scope:

1. choose distinct focused/reference laps;
2. hover Speed and Delta-T and confirm one distance updates both charts, map markers, inset markers, numeric readout, focused/reference G-G points, and the focused trail;
3. switch to 3D, rotate the sphere, and confirm the XYZ point/vector updates at the same cursor;
4. return to 2D, drag-zoom Speed/Delta-T, change scope, and confirm zoom resets without stale vector data;
5. select 3D, reload, and confirm the saved mode; return to 2D for the default handoff;
6. repeat at a narrow viewport and inspect console/page errors.

Expected: no stale points, overflow, blank WebGL canvas, page errors, or console errors.

- [ ] **Step 4: Record evidence and commit hardening changes**

Write exact test counts, build chunk evidence, VTA counts, tested laps/scope, responsive result, and browser error result under an execution evidence section in this plan.

```bash
git add -A
git commit -m "test: verify cursor acceleration vector"
```

### Task 6: Review, deploy, and prove production behavior

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-cursor-acceleration-vector.md`

- [ ] **Step 1: Review the complete change range**

Inspect `git diff 41d8224..HEAD`, dependency changes, lazy-load boundaries, preference migration, cleanup/disposal, accessibility labels, and tests. Resolve every Critical/Major issue, rerun its focused regression, then rerun the complete quality gate.

- [ ] **Step 2: Push main**

Run:

```bash
git status --short --branch
git push origin main
```

Expected: clean `main` advances on `origin/main`.

- [ ] **Step 3: Monitor CI and Pages**

Use `gh run list --commit <sha>` and `gh run watch <run-id> --exit-status` for both CI and Pages workflows.

Expected: every job and the GitHub Pages deploy finish successfully for the pushed SHA.

- [ ] **Step 4: Smoke-test production with Aside**

Open `https://woo4826.github.io/openvta-analyzer/?v=<sha>`, import the supplied VTA locally, and repeat Speed/Delta hover, map/vector synchronization, 2D/3D switching, section scope, persistence, and console-error checks.

Expected: production serves the pushed build and reproduces the local result.

- [ ] **Step 5: Record deployment evidence and commit documentation**

Add commit SHA, CI/Pages run IDs, deployed URL, selected laps/scope, VTA counts, vector-mode result, and console result to this plan. Commit and push the documentation update, then verify its Pages run if it changes deployable content.
