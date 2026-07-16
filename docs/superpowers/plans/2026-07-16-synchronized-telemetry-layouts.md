# Synchronized Telemetry Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the combined Lap Analysis telemetry canvas with three independently laid-out Speed, Delta-T, and measured Device X/Y/Z charts that share cursor, zoom, map position, and a browser-persisted layout choice.

**Architecture:** `SegmentTelemetryChart` becomes the shared interaction controller and renders three metric-specific `ChartPanel` instances. Distance remains the canonical cursor, time-mode hover resolves through the focused trajectory, and one normalized zoom window is supplied to all metric options. `SegmentWorkbenchPreferences` stores the selected layout globally, defaulting to the three-column dashboard.

**Tech Stack:** React 18, TypeScript, ECharts 5, Vitest, Testing Library, existing Playwright E2E, CSS Grid/container queries, Aside production QA.

---

## File Structure

- Modify `src/domain/types.ts`: add the telemetry layout preference type and field.
- Modify `src/domain/segmentWorkbenchPreferences.ts`: default, validate, load, and save the browser-wide layout.
- Modify `src/domain/__tests__/segmentWorkbenchPreferences.test.ts`: preference default, round-trip, and invalid-value coverage.
- Modify `src/components/segmentTelemetryOptions.ts`: build one ECharts option per metric with a shared domain and zoom window.
- Modify `src/components/ChartPanel.tsx`: emit normalized data-zoom changes while retaining cursor rendering.
- Modify `src/components/SegmentTelemetryChart.tsx`: own the three-chart composition, shared cursor conversion, shared zoom, and layout selector.
- Modify `src/components/SegmentAnalysisWorkbench.tsx`: pass and persist the selected layout.
- Modify `src/components/__tests__/ChartPanelComponent.test.tsx`: zoom-event contract.
- Modify `src/components/__tests__/SegmentTelemetryChart.test.tsx`: three independent charts, shared interaction, layouts, and degraded states.
- Modify `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`: workbench preference integration.
- Modify `src/i18n/lapLocales.ts`: chart and layout-control labels in English and Korean.
- Modify `src/styles.css`: three layouts, chart sizing, scroll safety, and narrow-container stacking.
- Modify `tests/analyzer.spec.ts`: production-shaped layout persistence and cross-chart cursor workflow.
- Modify `docs/superpowers/plans/2026-07-16-synchronized-telemetry-layouts.md`: execution and deployment evidence.

## Task 1: Persist the browser-wide layout preference

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/segmentWorkbenchPreferences.ts`
- Test: `src/domain/__tests__/segmentWorkbenchPreferences.test.ts`

- [x] **Step 1: Write failing default, round-trip, and invalid-value tests**

Add the following assertions:

```ts
expect(defaultSegmentWorkbenchPreferences().telemetryLayout).toBe("three-column");

const preferences = defaultSegmentWorkbenchPreferences();
preferences.telemetryLayout = "two-plus-one";
saveSegmentWorkbenchPreferences(preferences, storage);
expect(loadSegmentWorkbenchPreferences(storage).telemetryLayout).toBe("two-plus-one");

const invalidLayoutStorage = memoryStorage(new Map([[SEGMENT_WORKBENCH_STORAGE_KEY, JSON.stringify({
  ...defaultSegmentWorkbenchPreferences(),
  telemetryLayout: "diagonal",
})]]));
expect(loadSegmentWorkbenchPreferences(invalidLayoutStorage).telemetryLayout).toBe("three-column");
```

- [x] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm vitest run src/domain/__tests__/segmentWorkbenchPreferences.test.ts
```

Expected: FAIL because `telemetryLayout` is not part of the preference type or defaults.

- [x] **Step 3: Add the layout type, default, and validation**

In `src/domain/types.ts` add:

```ts
export type SegmentTelemetryLayout = "three-column" | "two-plus-one" | "three-stacked";

export interface SegmentWorkbenchPreferences {
  version: 2;
  drawerOpen: boolean;
  lapVisibility: SegmentLapVisibility;
  telemetryLayout: SegmentTelemetryLayout;
  snapToSections: boolean;
  visibleWidgets: Record<SegmentWidgetId, boolean>;
  layouts: Record<string, SegmentWidgetLayout[]>;
}
```

In `segmentWorkbenchPreferences.ts`, define the valid values and normalize old v2 data without rejecting the entire stored object:

```ts
const telemetryLayouts: SegmentTelemetryLayout[] = ["three-column", "two-plus-one", "three-stacked"];

// defaultSegmentWorkbenchPreferences
telemetryLayout: "three-column",

// load return value
telemetryLayout: telemetryLayouts.includes(value.telemetryLayout as SegmentTelemetryLayout)
  ? value.telemetryLayout as SegmentTelemetryLayout
  : defaults.telemetryLayout,
```

Do not require the field in the outer validity condition so existing v2
preferences migrate without losing saved widget layouts.

- [x] **Step 4: Run the preference tests**

Run the command from Step 2. Expected: PASS.

- [x] **Step 5: Commit the preference slice**

```bash
git add src/domain/types.ts src/domain/segmentWorkbenchPreferences.ts src/domain/__tests__/segmentWorkbenchPreferences.test.ts
git commit -m "feat: persist telemetry chart layout"
```

## Task 2: Build one ECharts option per telemetry metric

**Files:**
- Modify: `src/components/segmentTelemetryOptions.ts`
- Test: `src/components/__tests__/SegmentTelemetryChart.test.tsx`

- [x] **Step 1: Replace the combined-grid test with metric-option tests**

Test the new public contract:

```ts
const speed = buildSegmentTelemetryMetricOption(
  analysis(), ["lap-1", "lap-2"], "distance", "lap-2", "lap-1",
  labels(), "speed", undefined, { start: 10, end: 80 }, false,
);
const delta = buildSegmentTelemetryMetricOption(
  analysis(), ["lap-1", "lap-2"], "distance", "lap-2", "lap-1",
  labels(), "delta", undefined, { start: 10, end: 80 }, false,
);
const accelerationOption = buildSegmentTelemetryMetricOption(
  analysis(), ["lap-1", "lap-2"], "distance", "lap-2", "lap-1",
  labels(), "imu-acceleration", acceleration(), { start: 10, end: 80 }, true,
);

expect(speed.grid).not.toBeInstanceOf(Array);
expect(seriesIds(speed)).toEqual(["lap-2-speed", "lap-1-speed"]);
expect(seriesIds(delta)).toEqual(["lap-2-delta"]);
expect(seriesIds(accelerationOption)).toEqual([
  "imu-acceleration-x", "imu-acceleration-y", "imu-acceleration-z",
]);
expect(accelerationOption.dataZoom).toEqual(expect.arrayContaining([
  expect.objectContaining({ type: "inside", start: 10, end: 80 }),
  expect.objectContaining({ type: "slider", start: 10, end: 80 }),
]));
```

Retain the existing seven-lap speed and 10,000-sample acceleration-extrema tests.

- [x] **Step 2: Run the focused test and verify failure**

```bash
pnpm vitest run src/components/__tests__/SegmentTelemetryChart.test.tsx
```

Expected: FAIL because `buildSegmentTelemetryMetricOption` does not exist.

- [x] **Step 3: Implement the single-metric option builder**

Export these types and function:

```ts
export type CoreSegmentTelemetryMetric = "speed" | "imu-acceleration" | "delta";
export interface SegmentTelemetryZoomWindow { start: number; end: number }

export function buildSegmentTelemetryMetricOption(
  analysis: SegmentAnalysisResult,
  visibleLapIds: string[],
  axis: SegmentAxis,
  focusedLapId: string | undefined,
  referenceLapId: string | undefined,
  labels: SegmentTelemetryLabels,
  metric: CoreSegmentTelemetryMetric,
  synchronizedAcceleration: SynchronizedAccelerationSeries | undefined,
  zoomWindow: SegmentTelemetryZoomWindow,
  showZoomSlider: boolean,
): EChartsOption
```

Use one `grid`, one `xAxis`, and one `yAxis`. Speed includes every requested
presentation lap. Delta-T includes only the focused lap and a zero baseline.
Measured acceleration includes only downsampled focused-lap Device X/Y/Z. All
options use the same maximum domain calculation and include an inside data zoom;
only `showZoomSlider` adds the visible slider.

Keep the existing exported `buildSegmentTelemetryOption` unchanged in this
task so the current React component continues to compile. Task 4 removes that
combined builder after switching the component to the metric builder.

- [x] **Step 4: Run the focused test and typecheck**

```bash
pnpm vitest run src/components/__tests__/SegmentTelemetryChart.test.tsx
pnpm typecheck
```

Expected: metric option tests PASS and typecheck remains green because the
existing combined builder is retained until Task 4.

- [x] **Step 5: Commit the option-builder slice**

```bash
git add src/components/segmentTelemetryOptions.ts src/components/__tests__/SegmentTelemetryChart.test.tsx
git commit -m "refactor: build telemetry options per metric"
```

## Task 3: Add a shared zoom event contract to ChartPanel

**Files:**
- Modify: `src/components/ChartPanel.tsx`
- Test: `src/components/__tests__/ChartPanelComponent.test.tsx`

- [x] **Step 1: Write failing data-zoom event tests**

Capture the registered `datazoom` callback and assert normalized output:

```ts
const onZoomWindow = vi.fn();
render(<ChartPanel title="Speed" option={option} onZoomWindow={onZoomWindow} />);
const zoomHandler = chartDouble.on.mock.calls.find(([event]) => event === "datazoom")?.[1];

zoomHandler?.({ start: 12, end: 78 });
zoomHandler?.({ batch: [{ start: 20, end: 60 }] });

expect(onZoomWindow.mock.calls).toEqual([
  [{ start: 12, end: 78 }],
  [{ start: 20, end: 60 }],
]);
```

Also assert malformed or reversed values do not emit.

- [x] **Step 2: Run the ChartPanel test and verify failure**

```bash
pnpm vitest run src/components/__tests__/ChartPanelComponent.test.tsx
```

Expected: FAIL because `onZoomWindow` is not a `ChartPanel` prop.

- [x] **Step 3: Implement and clean up the zoom callback**

Add the prop:

```ts
onZoomWindow?: (window: { start: number; end: number }) => void;
```

Parse both direct and batch ECharts payloads:

```ts
function dataZoomWindow(value: unknown): { start: number; end: number } | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = Array.isArray(value.batch) ? value.batch[0] : value;
  if (!isRecord(candidate)) return undefined;
  const start = Number(candidate.start);
  const end = Number(candidate.end);
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= 100 && start < end
    ? { start, end }
    : undefined;
}
```

The existing `datazoom` handler must always redraw the cursor and optionally
emit the parsed window. Remove the same handler in effect cleanup.

- [x] **Step 4: Run focused tests**

```bash
pnpm vitest run src/components/__tests__/ChartPanelComponent.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit the chart interaction slice**

```bash
git add src/components/ChartPanel.tsx src/components/__tests__/ChartPanelComponent.test.tsx
git commit -m "feat: expose synchronized chart zoom"
```

## Task 4: Compose three charts under one shared cursor controller

**Files:**
- Modify: `src/components/SegmentTelemetryChart.tsx`
- Modify: `src/i18n/lapLocales.ts`
- Modify: `src/styles.css`
- Test: `src/components/__tests__/SegmentTelemetryChart.test.tsx`

- [x] **Step 1: Write failing three-chart and shared-hover tests**

Update the `ChartPanel` test double to record callbacks by title. Assert:

```ts
expect(screen.getAllByTestId("segment-chart")).toHaveLength(3);
expect(screen.getByRole("img", { name: "Speed comparison by distance" })).toBeVisible();
expect(screen.getByRole("img", { name: "Delta-T by distance" })).toBeVisible();
expect(screen.getByRole("img", { name: "Measured acceleration by distance" })).toBeVisible();

fireEvent.click(screen.getByRole("button", { name: "Hover Speed" }));
expect(onCursor).toHaveBeenCalledWith(50, 21);

fireEvent.click(screen.getByRole("button", { name: "Hover Delta-T" }));
expect(onCursor).toHaveBeenCalledWith(50, 21);

fireEvent.click(screen.getByRole("button", { name: "Hover Measured acceleration" }));
expect(onCursor).toHaveBeenCalledWith(50, 21);

expect(screen.getAllByTestId("segment-chart").map((chart) => chart.getAttribute("data-cursor-x")))
  .toEqual(["2", "2", "2"]);
```

Add a shared zoom assertion by invoking the acceleration chart's
`onZoomWindow({ start: 25, end: 70 })` and checking all three rebuilt options.
Invoke hover, click, and every keyboard action through each mocked chart and
assert they all use the same `onCursor` path. Add degraded-state assertions:

```ts
const noAcceleration = render(<I18nProvider><SegmentTelemetryChart
  analysis={analysis()} visibleLapIds={["lap-1", "lap-2"]}
  focusedLapId="lap-2" referenceLapId="lap-1" axis="distance"
  layout="three-column" onLayout={vi.fn()} onCursor={onCursor}
/></I18nProvider>);
expect(screen.getByText("Measured acceleration unavailable")).toBeVisible();
noAcceleration.unmount();

const noReference = render(<I18nProvider><SegmentTelemetryChart
  analysis={analysis()} visibleLapIds={["lap-1", "lap-2"]}
  focusedLapId="lap-2" axis="distance" synchronizedAcceleration={acceleration()}
  layout="three-column" onLayout={vi.fn()} onCursor={onCursor}
/></I18nProvider>);
expect(screen.getByText("Select a reference lap to calculate Delta-T")).toBeVisible();
noReference.unmount();

const empty = analysis();
empty.records.find((record) => record.lapId === "lap-2")!.trajectory = [];
onCursor.mockClear();
render(<I18nProvider><SegmentTelemetryChart
  analysis={empty} visibleLapIds={["lap-1", "lap-2"]}
  focusedLapId="lap-2" referenceLapId="lap-1" axis="distance"
  synchronizedAcceleration={acceleration()} layout="three-column"
  onLayout={vi.fn()} onCursor={onCursor}
/></I18nProvider>);
fireEvent.click(screen.getAllByRole("button", { name: /Hover/ })[0]);
expect(onCursor).not.toHaveBeenCalled();
```

- [x] **Step 2: Run the focused test and verify failure**

```bash
pnpm vitest run src/components/__tests__/SegmentTelemetryChart.test.tsx
```

Expected: FAIL because only one combined `ChartPanel` exists.

- [x] **Step 3: Implement the controller and three metric cards**

Extend props:

```ts
layout: SegmentTelemetryLayout;
onLayout: (layout: SegmentTelemetryLayout) => void;
```

Add shared state and reset behavior:

```ts
const [zoomWindow, setZoomWindow] = useState<SegmentTelemetryZoomWindow>({ start: 0, end: 100 });
useEffect(() => setZoomWindow({ start: 0, end: 100 }), [
  analysis.range.startDistanceMeters,
  analysis.range.endDistanceMeters,
  axis,
  focusedLapId,
]);
```

Render one outer telemetry region with a three-button layout selector and:

```tsx
<div className={`segment-telemetry-grid is-${layout}`} data-layout={layout}>
  <ChartPanel title={t("lap.workbench.chartSpeed")} option={speedOption} cursorX={cursorX} onHoverDomain={selectDomain} onPoint={selectPoint} onCursorKey={selectCursorKey} onZoomWindow={setZoomWindow} />
  <ChartPanel title={t("lap.workbench.chartDelta")} option={deltaOption} cursorX={cursorX} onHoverDomain={selectDomain} onPoint={selectPoint} onCursorKey={selectCursorKey} onZoomWindow={setZoomWindow} />
  <ChartPanel title={t("lap.workbench.chartImuAcceleration")} option={accelerationOption} cursorX={cursorX} onHoverDomain={selectDomain} onPoint={selectPoint} onCursorKey={selectCursorKey} onZoomWindow={setZoomWindow} />
</div>
```

Keep one `SegmentTelemetryTrackInset`, interpretation block, and shared live
readout after the grid. Every callback must resolve through the same focused
trajectory and the existing `onCursor` path.

Each layout button contains a CSS layout glyph marked `aria-hidden="true"` plus
its localized text. Derive the nearest synchronized acceleration sample from the
shared distance and add `Device X / Y / Z` values to the one shared readout. If
acceleration or reference evidence is missing, render the localized unavailable
message over that metric card while keeping its chart region and layout cell.
After the component imports the new metric builder, delete the obsolete
combined `buildSegmentTelemetryOption` implementation and its multi-grid-only
types.

- [x] **Step 4: Add localized layout labels and responsive CSS**

Add English and Korean keys for:

```text
lap.workbench.telemetryLayout
lap.workbench.layoutThreeColumn
lap.workbench.layoutTwoPlusOne
lap.workbench.layoutThreeStacked
lap.workbench.chartSpeedAriaDistance / Time
lap.workbench.chartDeltaAriaDistance / Time
lap.workbench.chartAccelerationAriaDistance / Time
lap.workbench.referenceRequired
lap.workbench.measuredAccelerationUnavailable
lap.workbench.currentMeasuredAcceleration
```

Use CSS Grid classes:

```css
.segment-telemetry-panel { container-type: inline-size; container-name: telemetry; }
.segment-telemetry-grid { display: grid; gap: var(--space-4); }
.segment-telemetry-grid.is-three-column { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.segment-telemetry-grid.is-two-plus-one { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.segment-telemetry-grid.is-two-plus-one > :nth-child(3) { grid-column: 1 / -1; }
.segment-telemetry-grid.is-three-stacked { grid-template-columns: 1fr; }
@container telemetry (max-width: 860px) {
  .segment-telemetry-grid { grid-template-columns: 1fr !important; }
  .segment-telemetry-grid > :nth-child(3) { grid-column: auto !important; }
}
```

Give each independent chart a readable minimum height while allowing the
dashboard widget body to scroll for the stacked layout.

- [x] **Step 5: Run focused tests and commit**

```bash
pnpm vitest run src/components/__tests__/SegmentTelemetryChart.test.tsx src/components/__tests__/ChartPanelComponent.test.tsx src/i18n/__tests__/i18n.test.ts
pnpm typecheck
pnpm lint
git add src/components/SegmentTelemetryChart.tsx src/components/segmentTelemetryOptions.ts src/components/__tests__/SegmentTelemetryChart.test.tsx src/i18n/lapLocales.ts src/styles.css
git commit -m "feat: split synchronized lap telemetry charts"
```

## Task 5: Connect the selector to saved workbench preferences

**Files:**
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`

- [x] **Step 1: Write a failing workbench persistence test**

Update the mocked telemetry chart to expose `layout` and `onLayout`, then assert:

```ts
expect(screen.getByTestId("telemetry-layout")).toHaveTextContent("three-column");
await user.click(screen.getByRole("button", { name: "Choose 2+1 telemetry layout" }));
expect(JSON.parse(localStorage.getItem(SEGMENT_WORKBENCH_STORAGE_KEY) ?? "{}"))
  .toMatchObject({ telemetryLayout: "two-plus-one" });
```

Rerender with a different `recordingId` and assert the same preference remains.

- [x] **Step 2: Run the focused test and verify failure**

```bash
pnpm vitest run src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
```

Expected: FAIL because the workbench does not pass the preference to telemetry.

- [x] **Step 3: Pass and update the layout preference**

Use:

```tsx
<SegmentTelemetryChart
  analysis={workbench.analysis}
  visibleLapIds={workbench.visibleLapIds}
  focusedLapId={workbench.focusedLapId}
  referenceLapId={workbench.referenceLapId}
  axis={workbench.axis}
  synchronizedAcceleration={synchronizedAcceleration}
  cursorDistanceMeters={cursorDistanceMeters}
  layout={preferences.telemetryLayout}
  onLayout={(telemetryLayout) => updatePreferences((current) => ({ ...current, telemetryLayout }))}
  onCursor={selectTelemetryCursor}
/>
```

Do not reset `telemetryLayout` in the recording identity effect or dashboard
layout reset action.

- [x] **Step 4: Run focused tests and commit**

```bash
pnpm vitest run src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/domain/__tests__/segmentWorkbenchPreferences.test.ts
pnpm typecheck
git add src/components/SegmentAnalysisWorkbench.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
git commit -m "feat: save telemetry layout selection"
```

## Task 6: Verify the browser workflow and responsive layouts

**Files:**
- Modify: `tests/analyzer.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-16-synchronized-telemetry-layouts.md`

- [x] **Step 1: Update failing E2E assertions for three charts**

Replace the single telemetry canvas expectation with:

```ts
await expect(analysisMain.locator(".dashboard-widget-telemetry canvas")).toHaveCount(3);
await expect(analysisMain.getByRole("img", { name: "Speed comparison by distance" })).toBeVisible();
await expect(analysisMain.getByRole("img", { name: "Delta-T by distance" })).toBeVisible();
await expect(analysisMain.getByRole("img", { name: "Measured acceleration by distance" })).toBeVisible();
await expect(analysisMain.locator(".segment-telemetry-grid")).toHaveAttribute("data-layout", "three-column");
```

Click 2+1 and stacked selectors, verify `data-layout` and local storage, reload,
return to Lap Analysis, and confirm the selection persists. Restore
three-column before the remainder of the workflow.

- [x] **Step 2: Add cross-chart hover and map/readout checks**

For each of the three chart canvases, move to 25% then 70% width and assert the
cursor-distance readout changes. After the final move, assert the compact track
inset's focused cursor circle position changed. Switch to the time axis and
repeat on the Delta-T canvas. Keyboard-focus the acceleration chart and assert
ArrowRight changes the same shared readout.

- [x] **Step 3: Run focused browser tests**

```bash
pnpm test:e2e --grep "imports a track"
```

Expected: desktop and mobile variants PASS. On mobile, the saved three-column
choice remains in local storage while computed chart cards are stacked.

- [x] **Step 4: Run the complete local verification gate**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 5: Run Aside QA with the supplied VTA and commit evidence-ready code**

Load `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`. Verify whole lap
and Corner 6 in all three layouts, hover each metric chart, time/distance mode,
shared zoom, main-map and inset markers, reload persistence, and narrow viewport
stacking. Then commit:

```bash
git add tests/analyzer.spec.ts docs/superpowers/plans/2026-07-16-synchronized-telemetry-layouts.md
git commit -m "test: verify synchronized telemetry layouts"
```

### Local verification evidence — 2026-07-16 KST

- Final local gate: TypeScript and ESLint passed; Vitest passed 57 files / 314 tests; production build completed; Playwright passed 16/16 desktop and mobile tests; `git diff --check` passed.
- Focused stability check: the mobile import/Lap Analysis scenario passed three consecutive repetitions after making plot-coordinate hover movement deterministic.
- Supplied recording: `VTA24082025_101142_CC00.Vta` parsed 1,589 GPS rows and 158,289 sensor rows and matched the Inje Speedium preset.
- Actual-data layouts: three-column cards measured 435 px each, 2+1 measured 650/650/1,310 px, and stacked measured 1,310 px per card. The chosen layout survived a page reload and re-import of the supplied VTA.
- Actual-data synchronization: on Inje Corner 6 with Lap 7 focused and Lap 4 referenced, hover in each of Speed, Delta-T, and measured acceleration moved the shared readout from 23 m to 326 m and moved the inset marker from `(12.76, 97.72)` to `(201.22, 61.75)`.
- Shared zoom: wheel zoom initiated over measured acceleration changed the rendered Speed, Delta-T, and measured-acceleration canvases together (`[true, true, true]`). Time-axis Delta-T hover moved the shared distance from 15 m to 340 m; keyboard Home then ArrowRight moved it from 340 m to 0 m to 5 m.
- Narrow actual-data container: at the `xs` dashboard breakpoint all three cards stacked at the same x/width (x 44 px, width 358 px). The 32-row compact telemetry widget left 263 px clearance below the context content.

## Task 7: Merge, deploy, and prove production behavior

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-synchronized-telemetry-layouts.md`

- [x] **Step 1: Record pre-deployment evidence**

Record commit SHA, local test counts, Aside measurements, actual detected track,
selected laps/section, layout persistence, and synchronized cursor observations
in this plan. Commit the evidence.

Pre-deployment candidate: `9800ce94e7106b7ff85d8544f8bbbd4b03c7cdc4` on `codex/synchronized-telemetry-layouts`, based on main `176769dc346a9783a3b7c99844c1fcd21452be8f`. The worktree and complete range passed whitespace checks. The final review also added a legacy-v2 compact-layout migration test so older saved y positions cannot overlap the expanded telemetry widget.

- [x] **Step 2: Fast-forward main and verify the merged tree**

```bash
git checkout main
git merge --ff-only codex/synchronized-telemetry-layouts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: merge succeeds without conflicts and all checks pass on `main`.

Merged-tree evidence: `main` fast-forwarded cleanly to `da3aae40528cd7bfc4ef9c0ba47a4e06b064e1ea`; TypeScript, ESLint, 57 Vitest files / 314 tests, production build, 16 Playwright desktop/mobile scenarios, whitespace checks, and clean-worktree checks all passed after the merge.

- [ ] **Step 3: Push and monitor both workflows**

```bash
git push origin main
gh run list --commit "$(git rev-parse HEAD)" --json databaseId,workflowName,status,conclusion,url
```

Watch both CI and Deploy Pages with `gh run watch <id> --exit-status` until both
exit 0.

- [ ] **Step 4: Run production Aside verification**

Open a cache-busted `https://woo4826.github.io/openvta-analyzer/`, load the
supplied VTA, and repeat: default three-column, 2+1, stacked, reload persistence,
Corner 6 hover from every chart, shared readout and map/inset position, time
axis, and narrow viewport stacking.

- [ ] **Step 5: Record final workflow and production evidence**

Mark every plan checkbox complete, add CI/Pages run URLs and production
measurements, commit and push the documentation update, monitor its final Pages
run, and confirm `main`, `origin/main`, and the worktree are clean and aligned.
