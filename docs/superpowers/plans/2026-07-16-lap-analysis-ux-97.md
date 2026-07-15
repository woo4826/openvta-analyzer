# Lap Analysis UX 97 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the main thread. Subagents perform read-only spec, code-quality, and UX score reviews after each batch.

**Goal:** Make the supplied VTA’s Lap Analysis workflow score at least 97/100 from every independent reviewer, with no Critical or Major findings, then deploy it.

**Architecture:** Keep `LapAnalysis` mounted to preserve local comparison state while the existing `active` path releases map/chart resources. Promote lap and section selection into a persistent toolbar/ribbon, make map fitting and cursor selection scope-aware, add pure pairwise comparison evidence, and extend the chart with keyboard traversal plus a lightweight SVG position inset. Shared focus containment supports both advanced panels.

**Tech Stack:** React 19, TypeScript, ECharts, MapLibre GL, react-grid-layout, Radix Slider, Vitest, Testing Library, Aside, GitHub Actions/Pages.

---

## Task 1: Preserve state and expose the primary comparison workflow

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/components/LapAnalysis.tsx`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/SegmentScopeRibbon.tsx`
- Modify: `src/components/SegmentWorkbenchControls.tsx`
- Modify: `src/components/__tests__/LapAnalysis.test.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Modify: `src/app/__tests__/AppLapSource.test.tsx`
- Modify: `src/i18n/lapLocales.ts`
- Modify: `src/styles.css`

- [x] **Step 1: Write failing state-preservation and persistent-control tests**

Add assertions that `LapAnalysis` remains mounted with `active={false}` after a
top-tab change, that focused/reference selects are visible without opening the
drawer, and that named section chips plus previous/next controls update scope.

```tsx
expect(screen.getByRole("combobox", { name: "Focused lap" })).toBeVisible();
expect(screen.getByRole("combobox", { name: "Reference lap" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "Corner 1" }));
expect(screen.getByText(/Corner 1 · 10–90 m/)).toBeVisible();
await user.click(screen.getByRole("button", { name: "Next section" }));
expect(screen.getByText(/Straight 1/)).toBeVisible();
```

- [x] **Step 2: Run focused tests and confirm they fail**

Run:

```bash
pnpm vitest run src/app/__tests__/AppLapSource.test.tsx src/components/__tests__/LapAnalysis.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
```

Expected: FAIL because Lap Analysis unmounts and the primary selectors/ribbon
are only available in the drawer or not rendered.

- [x] **Step 3: Keep Lap Analysis mounted and pass active state down**

Change the App branch to render Lap Analysis whenever its tab panel exists:

```tsx
{tab.key === "laps" ? (
  <LapAnalysis
    active={activeTab === "laps"}
    {...lapProps}
  />
) : null}
```

Add `active: boolean` to `LapAnalysisProps` and pass:

```tsx
<SegmentAnalysisWorkbench
  active={active && activeView === "insights"}
  {...workbenchProps}
/>
```

- [x] **Step 4: Promote comparison selectors and section ribbon**

Render native selects in the comparison toolbar with option labels produced by:

```ts
function lapControlLabel(record: SegmentLapRecord, t: T): string {
  const completion = record.completion === "complete" ? "" : ` · ${recordStatusLabel(record, t)}`;
  return `${workbenchLapLabel(record, t)} · ${formatTime(record.durationSeconds)}${completion}`;
}
```

Render `SegmentScopeRibbon` immediately below the toolbar and add previous/next
section buttons whose disabled state is based on the selected section index.
Move the Analysis controls trigger into the toolbar. Remove focused/reference
selects and section selection buttons from the advanced drawer; keep visible
laps, axis, partial policy, custom range, and widget settings there.

- [x] **Step 5: Make the proportional strip presentational**

Replace proportional buttons with spans:

```tsx
<div className="segment-proportion-strip" aria-hidden>
  {sections.map((section) => (
    <span key={section.id} className={`segment-proportion-section ${section.kind}`} style={sectionStyle(section)} />
  ))}
</div>
```

Retain the Radix dual-thumb slider for custom ranges.

- [x] **Step 6: Add localized labels and responsive toolbar styles**

Add keys for previous/next section, pairwise delta, advanced settings, track
definition, and comparable coverage in English and Korean. Make section chips
at least 44 px tall and keep them horizontally scrollable.

- [x] **Step 7: Run focused tests and commit**

Run the focused command from Step 2 plus:

```bash
pnpm vitest run src/components/__tests__/SegmentRangeNavigator.test.tsx
```

Expected: PASS.

Commit:

```bash
git add src/app/App.tsx src/components src/i18n/lapLocales.ts src/styles.css
git commit -m "feat: expose persistent lap comparison controls"
```

## Task 2: Make map fitting and cursor state scope-aware

**Files:**
- Modify: `src/components/RouteMap.tsx`
- Modify: `src/components/SegmentTrajectoryMap.tsx`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/__tests__/RouteMapSources.test.tsx`
- Modify: `src/components/__tests__/SegmentTrajectoryMap.test.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`

- [x] **Step 1: Write failing fit-point and out-of-scope cursor tests**

Assert that changing `fitPoints` calls `fitBounds` with only those coordinates,
that the Fit route button uses them, and that an out-of-scope selected index
resolves to the first interaction sample without breaking whole-record maps.

```tsx
view.rerender(wrappedRoute(0, false, {
  interactionPoints: segmentPoints,
  fitPoints: segmentPoints,
  followSelectedPoint: false,
}));
expect(map.fitBounds).toHaveBeenLastCalledWith(expect.objectContaining({}), expect.any(Object));
expect(map.sources.get("selected-point-source")?.setData).toHaveBeenCalledWith(
  expect.objectContaining({ geometry: { coordinates: [segmentPoints[0].longitude, segmentPoints[0].latitude] } }),
);
```

- [x] **Step 2: Run focused tests and confirm failure**

```bash
pnpm vitest run src/components/__tests__/RouteMapSources.test.tsx src/components/__tests__/SegmentTrajectoryMap.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
```

Expected: FAIL because RouteMap always fits all recording points.

- [x] **Step 3: Add fitPoints and selected-point resolution**

Add:

```ts
fitPoints?: GpsPoint[];

const routeFitPoints = fitPoints?.length ? fitPoints : interactionPoints?.length ? interactionPoints : points;
const selected = interactionPoints?.find((point) => point.index === selectedIndex)
  ?? (interactionPoints?.length ? interactionPoints[0] : points[selectedIndex]);
```

Use `routeFitPoints` in initial fit, the Fit route action, and a fit effect keyed
by the fit-point route identity. Keep `followSelectedPoint={false}` for the
comparison map so live cursor changes only move markers.

- [x] **Step 4: Synchronize workbench cursor when scope changes**

When the focused trajectory changes, preserve `selectedPointIndex` only when it
is present in the new trajectory; otherwise select the first sample and set
cursor distance to its distance.

```ts
const selected = focused?.trajectory.find((sample) => sample.sourceIndex === selectedPointIndex);
const next = selected ?? focused?.trajectory[0];
if (next) {
  setCursorDistanceMeters(next.distanceMeters);
  if (!selected) onSelectedPointIndex(next.sourceIndex);
}
```

- [x] **Step 5: Pass focused trajectory fit points and correct map semantics**

`SegmentTrajectoryMap` passes `focusedInteractionPoints` as both
`interactionPoints` and `fitPoints`. Add a comparison-specific accessible map
label instead of the speed-colored label when route speed points are hidden.

- [x] **Step 6: Run focused tests and commit**

Run Step 2. Expected: PASS.

```bash
git add src/components/RouteMap.tsx src/components/SegmentTrajectoryMap.tsx src/components/SegmentAnalysisWorkbench.tsx src/components/__tests__
git commit -m "fix: fit lap map to the active analysis scope"
```

## Task 3: Add selected-reference evidence and reliable data-quality handling

**Files:**
- Create: `src/domain/segmentPairwiseEvidence.ts`
- Create: `src/domain/__tests__/segmentPairwiseEvidence.test.ts`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/SegmentLapTable.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Modify: `src/components/__tests__/SegmentLapTable.test.tsx`
- Modify: `src/i18n/lapLocales.ts`
- Modify: `src/styles.css`

- [x] **Step 1: Write failing pure pairwise-evidence tests**

Define the expected result:

```ts
expect(buildSegmentPairwiseEvidence(focused, reference)).toEqual({
  timeDeltaSeconds: -2.686,
  entrySpeedDeltaKmh: 24.1,
  minimumSpeedDeltaKmh: 38.7,
  exitSpeedDeltaKmh: 3.3,
  drivenDistanceDeltaMeters: 12.1,
});
```

Also test missing metrics and no reference.

- [x] **Step 2: Run tests and confirm failure**

```bash
pnpm vitest run src/domain/__tests__/segmentPairwiseEvidence.test.ts src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/components/__tests__/SegmentLapTable.test.tsx
```

Expected: FAIL because the helper and pairwise UI do not exist.

- [x] **Step 3: Implement the pure helper**

```ts
export function buildSegmentPairwiseEvidence(focused?: SegmentLapRecord, reference?: SegmentLapRecord) {
  if (!focused || !reference) return undefined;
  return {
    timeDeltaSeconds: difference(focused.durationSeconds, reference.durationSeconds),
    entrySpeedDeltaKmh: difference(focused.entrySpeedKmh, reference.entrySpeedKmh),
    minimumSpeedDeltaKmh: difference(focused.minimumSpeedKmh, reference.minimumSpeedKmh),
    exitSpeedDeltaKmh: difference(focused.exitSpeedKmh, reference.exitSpeedKmh),
    drivenDistanceDeltaMeters: difference(focused.drivenDistanceMeters, reference.drivenDistanceMeters),
  };
}
```

- [x] **Step 4: Render pairwise evidence first and session-best second**

Add a compact comparison summary to the toolbar/evidence panel. Use `ahead` for
negative time delta, `behind` for positive, and explicitly label the existing
`deltaBestSeconds` as session-best delta. Do not add a ranking or opportunity
list.

- [x] **Step 5: Qualify low-confidence metrics and add remediation**

For `gpsConfidence === "low" || "unknown"`, render G details as
`Unreliable · low GPS confidence`. Build the quality reason from record flags
and missing accuracy evidence. Add a Track & lap setup button inside the caution
card.

- [x] **Step 6: Run focused tests and commit**

Run Step 2. Expected: PASS.

```bash
git add src/domain/segmentPairwiseEvidence.ts src/domain/__tests__/segmentPairwiseEvidence.test.ts src/components src/i18n/lapLocales.ts src/styles.css
git commit -m "feat: compare selected laps with explicit evidence"
```

## Task 4: Add keyboard telemetry traversal and a synchronized track inset

**Files:**
- Create: `src/components/SegmentTelemetryTrackInset.tsx`
- Create: `src/components/__tests__/SegmentTelemetryTrackInset.test.tsx`
- Modify: `src/components/ChartPanel.tsx`
- Modify: `src/components/SegmentTelemetryChart.tsx`
- Modify: `src/components/__tests__/ChartPanelComponent.test.tsx`
- Modify: `src/components/__tests__/SegmentTelemetryChart.test.tsx`
- Modify: `src/i18n/lapLocales.ts`
- Modify: `src/styles.css`

- [x] **Step 1: Write failing keyboard and inset tests**

Test ArrowLeft/ArrowRight/PageUp/PageDown/Home/End on the chart wrapper and
assert `onCursorKey` receives the intended action. Test that the inset renders
two paths and two cursor markers at a supplied distance.

```tsx
await user.tab();
await user.keyboard("{ArrowRight}{PageDown}{End}");
expect(onCursorKey.mock.calls.map(([key]) => key)).toEqual(["next", "page-next", "end"]);
```

- [x] **Step 2: Run focused tests and confirm failure**

```bash
pnpm vitest run src/components/__tests__/ChartPanelComponent.test.tsx src/components/__tests__/SegmentTelemetryChart.test.tsx src/components/__tests__/SegmentTelemetryTrackInset.test.tsx
```

Expected: FAIL because the chart is not focusable and the inset is absent.

- [x] **Step 3: Add generic keyboard cursor actions to ChartPanel**

Add `onCursorKey?: (action: "previous" | "next" | "page-previous" |
"page-next" | "start" | "end") => void`. When present, the chart div receives
`tabIndex={0}`, `aria-keyshortcuts`, and a keydown handler. Do not move lap-domain
logic into ChartPanel.

- [x] **Step 4: Resolve keyboard actions to trajectory samples**

In `SegmentTelemetryChart`, find the nearest focused sample to the current
cursor. Move by one sample for arrows, by `max(1, floor(length / 20))` for page
keys, and clamp start/end. Call the existing `onCursor` path.

- [x] **Step 5: Implement the compact SVG inset**

Normalize focused and reference trajectory longitude/latitude into one shared
viewBox. Draw focused solid and reference dashed paths, then draw marker circles
at `nearestDistanceSample`. Return localized unavailable copy for fewer than two
usable points.

- [x] **Step 6: Add interpretation copy and readout semantics**

Add visible copy for pairwise Delta-T and focused-lap raw device axes. Give the
readout a stable ID and connect the chart with `aria-describedby`.

- [x] **Step 7: Run focused tests and commit**

Run Step 2. Expected: PASS.

```bash
git add src/components/ChartPanel.tsx src/components/SegmentTelemetryChart.tsx src/components/SegmentTelemetryTrackInset.tsx src/components/__tests__ src/i18n/lapLocales.ts src/styles.css
git commit -m "feat: make lap telemetry spatially and keyboard accessible"
```

## Task 5: Correct panel focus and mobile control layout

**Files:**
- Create: `src/components/useContainedPanelFocus.ts`
- Create: `src/components/__tests__/useContainedPanelFocus.test.tsx`
- Modify: `src/components/SegmentWorkbenchControls.tsx`
- Modify: `src/components/SegmentLapLayerControls.tsx`
- Modify: `src/components/__tests__/SegmentLapLayerControls.test.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Modify: `src/styles.css`

- [x] **Step 1: Write failing focus lifecycle tests**

For each panel assert opening focuses Close, Tab and Shift+Tab wrap, Escape
closes, and the original trigger regains focus. Assert the panel body has a
bounded scroll area.

- [x] **Step 2: Run focused tests and confirm failure**

```bash
pnpm vitest run src/components/__tests__/useContainedPanelFocus.test.tsx src/components/__tests__/SegmentLapLayerControls.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
```

Expected: FAIL on initial focus, wrapping, Escape for layers, and restoration.

- [x] **Step 3: Implement shared focus containment**

```ts
export function useContainedPanelFocus(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    focusFirst(panelRef.current);
    const onKeyDown = (event: KeyboardEvent) => containOrClose(event, panelRef.current, onClose);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); (triggerRef.current ?? previous)?.focus(); };
  }, [open, onClose]);
  return { panelRef, triggerRef };
}
```

- [x] **Step 4: Shift the complete workspace on desktop**

While controls are open, toggle `document.documentElement.classList` with
`lap-analysis-controls-open`. Apply the wide-screen left margin and width to
`.workspace`, not only `.segment-workbench`. On <=1180 px use overlay behavior;
on <=680 px use a scrim and full-width drawer.

- [x] **Step 5: Prevent mobile map control overlap**

At <=680 px make `.segment-lap-layer-controls` static above the map, place the
MapControls toolbar in a dedicated top row, remove sticky comparison masking,
and enforce 44×44 px on icon buttons.

- [x] **Step 6: Run focused tests and commit**

Run Step 2. Expected: PASS.

```bash
git add src/components/useContainedPanelFocus.ts src/components/SegmentWorkbenchControls.tsx src/components/SegmentLapLayerControls.tsx src/components/__tests__ src/styles.css
git commit -m "fix: make lap controls accessible and collision free"
```

## Task 6: Add export feedback and end-to-end UX assertions

**Files:**
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Modify: `tests/analyzer.spec.ts`
- Modify: `src/i18n/lapLocales.ts`
- Modify: `docs/superpowers/plans/2026-07-16-lap-analysis-ux-97.md`

- [x] **Step 1: Write failing export-status and workflow assertions**

Assert the generated filename is announced after CSV/JSON export. Extend E2E to
cover visible lap selectors, 44 px section chips, Corner 6 auto-fit, pairwise
delta, keyboard cursor movement, tab round-trip state, panel Escape/restoration,
and non-overlapping mobile controls.

- [x] **Step 2: Run focused tests and confirm failure**

```bash
pnpm vitest run src/components/__tests__/SegmentAnalysisWorkbench.test.tsx
pnpm test:e2e --grep "imports a track"
```

Expected: FAIL until feedback and full workflow assertions are implemented.

- [x] **Step 3: Implement export announcements**

Set a localized status immediately after `downloadText`:

```ts
const fileName = `${safeBaseName(sourceName)}.segment-analysis.csv`;
downloadText(fileName, segmentAnalysisCsv(workbench.analysis), "text/csv");
setExportStatus(t("lap.workbench.exportComplete", { file: fileName }));
```

Render it in a polite live region near the toolbar.

- [x] **Step 4: Complete E2E assertions and run the full local gate**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all commands exit 0.

- [x] **Step 5: Commit verification-ready implementation**

```bash
git add src tests docs/superpowers/plans/2026-07-16-lap-analysis-ux-97.md
git commit -m "test: verify lap analysis professional workflow"
```

## Task 7: Independent score loop, deployment, and production proof

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-lap-analysis-ux-97.md`

- [x] **Step 1: Run Aside desktop and mobile-sized QA with the supplied VTA**

Verify focus/reference changes, Corner 6 and Straight 5 navigation, scope-aware
fit, pointer and keyboard telemetry cursor, compact track inset, partial-lap
policy, export status, tab round trip, both focus-contained panels, and mobile
control geometry.

- [x] **Step 2: Dispatch three independent read-only reviewers**

Give each reviewer the fixed rubric and require evidence, exact repro steps, and
severity. The score for the round is the minimum result.

- [x] **Step 3: Repeat implementation and re-review while required**

If any score is below 97 or any Critical/Major issue remains, add a focused
failing test, fix the root cause in the main thread, rerun the local gate and
Aside QA, then repeat Step 2.

### Pre-deployment gate evidence — 2026-07-16

- Final scored commit: `47bbae61a91d1b8c39d14a4e92f0bc5cf318cdfe`.
- Independent reviewer scores: **98/100**, **99/100**, **99/100**; strict
  minimum **98/100**. All reviewers reported Critical **0** and Major **0**.
- Final read-only code review: Critical **0**, Important **0**, Minor **0**;
  strict merge-ready verdict **Yes**.
- Local verification: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  and `pnpm test:e2e` all exited 0. Vitest passed **57 files / 307 tests**;
  desktop and mobile browser suites passed **16/16 tests**.
- Supplied VTA evidence: Inje Speedium track definition **3915 m**; whole-lap
  comparable coverage **0–3915 m**; Corner 6 coverage **1703–2043 m**; selected
  Lap 7 versus Lap 4 delta **-2.686 s**; synchronized IMU **825 samples**.
- Low-GPS Setup evidence: all 15 corners × 2 GPS-derived G columns were masked,
  producing **30** reliability labels and **0** numeric G values.
- Controls evidence: desktop drawer parent `BODY`, geometry `x=12, y=70,
  410×818`; workspace shifted to `x=434, width=991`; leaving Lap Analysis
  immediately removes the dialog, scrim, and document shift class.
- Recording-lifecycle evidence: a same-name/same-shape recording replacement
  clears stale export feedback and lap-layer overrides using stable
  `activeFile.id` identity.

- [ ] **Step 4: Merge and deploy only after the score gate passes**

Fast-forward the completed feature branch to `main`, push `origin/main`, monitor
CI and Deploy Pages to success, then load the production URL with the supplied
VTA and repeat the critical smoke tests.

- [ ] **Step 5: Record final evidence**

Record final reviewer scores, verification command results, production commit,
workflow run URLs, and Aside measurements in this plan. Commit and push the
evidence update, then verify the final Pages run.
