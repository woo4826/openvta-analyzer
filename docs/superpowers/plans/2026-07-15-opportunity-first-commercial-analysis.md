# Opportunity-First Commercial Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Lap Analysis into a production-ready workflow that immediately ranks the corners and sections where the selected lap loses the most time, then lets the driver inspect synchronized speed, acceleration, Delta-T, map, and lap evidence.

**Architecture:** Keep the zero-backend `LapWorkspace` as the session source of truth. Add a pure opportunity-ranking domain module, a focused opportunity overview, and a synchronized telemetry chart; then make `LapAnalysis` progressively disclose comparison and setup tools behind explicit views. Extend the existing map and ECharts adapters instead of adding new visualization dependencies.

**Tech Stack:** React 18, TypeScript, ECharts 5, MapLibre GL, Vitest, Testing Library, Vite, GitHub Pages.

---

## File map

- Create `src/domain/opportunityAnalysis.ts`: rank section time loss and produce GPS-evidence coaching causes.
- Create `src/domain/__tests__/opportunityAnalysis.test.ts`: prove ranking, partial-lap eligibility, and empty/invalid behavior.
- Create `src/components/LapOpportunityOverview.tsx`: session KPIs, selected-lap control, opportunity cards, and linked map.
- Create `src/components/LapTelemetryChart.tsx`: time/distance speed, derived acceleration, and Delta-T chart with linked zoom and brush.
- Create `src/components/__tests__/LapTelemetryChart.test.tsx`: verify chart channels, axes, zoom, brush, and source-index encoding.
- Create `src/components/__tests__/LapOpportunityOverview.test.tsx`: verify ranked opportunity rendering and selection.
- Modify `src/app/useLapWorkspace.ts`: auto-apply matching presets and persist a recording-derived preset when none matches.
- Modify `src/app/__tests__/useLapWorkspace.test.tsx`: prove preset priority, auto-generation, persistence, and reuse.
- Modify `src/components/ChartPanel.tsx`: preserve GPS source indexes when chart points are clicked or brushed.
- Modify `src/components/RouteMap.tsx`: accept per-section loss styling and section selection for MapLibre and SVG fallback.
- Modify `src/components/LapExplorer.tsx`: accept a controlled analysis scope and reuse the selected opportunity.
- Modify `src/components/LapAnalysis.tsx`: introduce Insights, Compare, and Setup views; move the long editor stack out of the default view.
- Modify `src/app/App.tsx`: remove the unrelated workspace inspector from the Lap Analysis layout.
- Modify `src/i18n/lapLocales.ts`: add complete English/Korean commercial-analysis copy with English fallback for secondary languages.
- Modify `src/styles.css`: add responsive opportunity, chart, view-navigation, and settings disclosure layouts.
- Modify `src/components/__tests__/LapAnalysis.test.tsx`, `src/components/__tests__/LapExplorer.test.tsx`, and `tests/analyzer.spec.ts`: protect the new primary workflow.

### Task 0: Make track and section presets automatic

**Files:**
- Modify: `src/app/useLapWorkspace.ts`
- Modify: `src/app/__tests__/useLapWorkspace.test.tsx`
- Modify: `src/i18n/lapLocales.ts`

- [ ] **Step 1: Write failing preset-flow tests**

```ts
it("applies the best unambiguous saved preset before network lookup", async () => {
  mocks.listTrackProfiles.mockResolvedValue([savedPresetWithSections]);
  mocks.scoreTrackProfile.mockReturnValue({ profile: savedPresetWithSections, medianDistanceMeters: 4, lengthRatio: 1, score: 4 });
  const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", multiLapPoints()));
  await waitFor(() => expect(result.current.profile?.id).toBe(savedPresetWithSections.id));
  expect(mocks.lookupOsmTracks).not.toHaveBeenCalled();
});

it("persists an automatically generated track and section preset when none matches", async () => {
  mocks.listTrackProfiles.mockResolvedValue([]);
  mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
  const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", multiLapPoints()));
  act(() => result.current.useSelectedPointAsStartFinish(0));
  await waitFor(() => expect(mocks.saveTrackProfile).toHaveBeenCalledWith(expect.objectContaining({
    source: { kind: "recording" },
    sections: expect.arrayContaining([expect.objectContaining({ source: "automatic" })]),
  })));
});
```

- [ ] **Step 2: Run the focused hook test and confirm failure**

Run: `pnpm test src/app/__tests__/useLapWorkspace.test.tsx`
Expected: the generated-preset persistence assertion fails.

- [ ] **Step 3: Implement preset priority and persistence**

Preserve the existing priority of unambiguous saved profiles before OSM lookup. If the matched preset has no sections, enrich it from the fastest valid complete lap without replacing user-authored sections. If no preset matches, create a `source.kind === "recording"` profile after the user or imported start/finish gate yields a complete lap, generate corner/straight sections from that representative lap, and save the finished profile to IndexedDB once per profile revision. The same profile must be discoverable by `scoreTrackProfile` on later recordings.

- [ ] **Step 4: Run focused hook tests**

Run: `pnpm test src/app/__tests__/useLapWorkspace.test.tsx`
Expected: PASS.

### Task 1: Rank actionable section losses

**Files:**
- Create: `src/domain/opportunityAnalysis.ts`
- Create: `src/domain/__tests__/opportunityAnalysis.test.ts`

- [ ] **Step 1: Write failing ranking tests**

```ts
it("ranks the selected lap's largest positive section losses", () => {
  const summary = analyzeLapOpportunities("lap-a", sections, results, 3);
  expect(summary.opportunities.map((item) => item.sectionId)).toEqual(["corner-2", "corner-1", "straight-1"]);
  expect(summary.potentialGainSeconds).toBeCloseTo(1.35);
});

it("uses only eligible results as the best-section reference", () => {
  const summary = analyzeLapOpportunities("lap-a", sections, resultsWithIneligiblePartialBest, 3);
  expect(summary.opportunities[0].bestLapId).toBe("lap-b");
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm test src/domain/__tests__/opportunityAnalysis.test.ts`
Expected: FAIL because `analyzeLapOpportunities` does not exist.

- [ ] **Step 3: Implement the pure analysis API**

```ts
export type OpportunityCause = "entry-speed" | "minimum-speed" | "exit-speed" | "overall-pace";

export interface LapOpportunity {
  rank: number;
  sectionId: string;
  name: string;
  kind: TrackSectionKind;
  lostSeconds: number;
  share: number;
  cause: OpportunityCause;
  speedDeficitKmh: number;
  bestLapId: string;
}

export interface LapOpportunitySummary {
  lapId?: string;
  potentialGainSeconds: number;
  analyzedSectionCount: number;
  opportunities: LapOpportunity[];
}
```

The implementation must compare the selected lap result with the fastest `eligibleForBest` result for the same section, ignore non-positive/noise deltas below 0.05 seconds, rank descending, and classify the largest entry/minimum/exit speed deficit above 2 km/h as GPS-derived evidence.

- [ ] **Step 4: Run focused tests**

Run: `pnpm test src/domain/__tests__/opportunityAnalysis.test.ts`
Expected: PASS.

### Task 2: Preserve source indexes through interactive charts

**Files:**
- Modify: `src/components/ChartPanel.tsx`
- Test: `src/components/__tests__/Charts.test.tsx`

- [ ] **Step 1: Add a failing chart event test**

```ts
it("uses the third chart coordinate as the GPS source index", () => {
  expect(chartPointIndex([12.4, 88, 431])).toBe(431);
});
```

- [ ] **Step 2: Export and implement index extraction**

Prefer the third numeric coordinate for `[x, y, sourceIndex]`; retain the first coordinate fallback for legacy `[pointIndex, value]` series. Resolve brush `seriesIndex` plus `dataIndex` values back to third-coordinate source indexes before emitting `onBrushSegment`.

- [ ] **Step 3: Verify the focused component tests**

Run: `pnpm test src/components/__tests__/Charts.test.tsx`
Expected: PASS.

### Task 3: Build the synchronized commercial telemetry chart

**Files:**
- Create: `src/components/LapTelemetryChart.tsx`
- Create: `src/components/__tests__/LapTelemetryChart.test.tsx`
- Modify: `src/i18n/lapLocales.ts`

- [ ] **Step 1: Write failing chart option tests**

```ts
expect(option.xAxis).toHaveLength(3);
expect(seriesNames(option)).toEqual(["Speed", "Derived acceleration", "Delta-T"]);
expect(option.dataZoom).toEqual(expect.arrayContaining([
  expect.objectContaining({ type: "inside", xAxisIndex: [0, 1, 2] }),
  expect.objectContaining({ type: "slider", xAxisIndex: [0, 1, 2] }),
]));
expect(option.toolbox).toEqual(expect.objectContaining({ feature: expect.objectContaining({ brush: expect.anything(), restore: {} }) }));
```

- [ ] **Step 2: Implement `LapTelemetryChart`**

Use `scopedLapComparison` as the aligned sample source. Default to elapsed time, allow a time/distance toggle, derive longitudinal acceleration in G from adjacent speed samples, link all grids with one axis pointer and data zoom, encode every point as `[x, y, sourceIndex]`, and emit brushed GPS source ranges through `onActiveSegment`.

- [ ] **Step 3: Run focused chart tests**

Run: `pnpm test src/components/__tests__/LapTelemetryChart.test.tsx`
Expected: PASS.

### Task 4: Add opportunity cards and a loss-colored map

**Files:**
- Create: `src/components/LapOpportunityOverview.tsx`
- Create: `src/components/__tests__/LapOpportunityOverview.test.tsx`
- Modify: `src/components/RouteMap.tsx`
- Modify: `src/i18n/lapLocales.ts`

- [ ] **Step 1: Write failing overview tests**

```tsx
expect(screen.getByRole("heading", { name: "Biggest time-loss opportunities" })).toBeVisible();
expect(screen.getByRole("button", { name: /Corner 2.*0.720 s/ })).toHaveAttribute("aria-pressed", "true");
await user.click(screen.getByRole("button", { name: /Corner 1/ }));
expect(onSelectSection).toHaveBeenCalledWith("corner-1");
```

- [ ] **Step 2: Extend `RouteMap` section interaction**

Add `sectionVisuals` and `onSectionSelect`. MapLibre section features must carry `color`, `width`, and `opacity` properties; the SVG fallback must use the same values and keyboard/click semantics. The selected opportunity uses the strongest stroke, ranked losses use red/amber tones, and the remaining line stays neutral.

- [ ] **Step 3: Implement the overview**

Render fastest lap, automatic theoretical best, selected-lap potential, completed/partial counts, a primary-lap selector, the large map, and up to three ranked opportunity cards. Copy must label acceleration and cause evidence as GPS-derived rather than claiming brake/throttle telemetry.

- [ ] **Step 4: Run overview and map tests**

Run: `pnpm test src/components/__tests__/LapOpportunityOverview.test.tsx src/components/__tests__/RouteMapSources.test.tsx`
Expected: PASS.

### Task 5: Recompose Lap Analysis around Insights, Compare, and Setup

**Files:**
- Modify: `src/components/LapAnalysis.tsx`
- Modify: `src/components/LapExplorer.tsx`
- Modify: `src/components/__tests__/LapAnalysis.test.tsx`
- Modify: `src/components/__tests__/LapExplorer.test.tsx`
- Modify: `src/i18n/lapLocales.ts`

- [ ] **Step 1: Write failing primary-flow tests**

```tsx
expect(screen.getByRole("tab", { name: "Insights" })).toHaveAttribute("aria-selected", "true");
expect(screen.getByText("Biggest time-loss opportunities")).toBeVisible();
expect(screen.queryByText("Corner and straight definitions")).not.toBeInTheDocument();
await user.click(screen.getByRole("tab", { name: "Setup" }));
expect(screen.getByText("Corner and straight definitions")).toBeVisible();
```

- [ ] **Step 2: Implement progressive disclosure**

Make Insights the default. Render the opportunity overview and commercial chart only when laps and analysis sections exist. Render a focused start/finish setup state when no gate exists. Keep the lap comparison table and `LapExplorer` in Compare. Move track import/export, gate editing, boundary correction, partial-lap policy, timing sector gates, section editing, and analysis export into Setup using collapsed `<details>` groups.

- [ ] **Step 3: Make opportunity selection control the explorer and chart**

Add optional controlled `scopeId` and `onScopeIdChange` props to `LapExplorer`. A card or map click updates the selected section; entering Compare keeps that scope selected.

- [ ] **Step 4: Verify component tests**

Run: `pnpm test src/components/__tests__/LapAnalysis.test.tsx src/components/__tests__/LapExplorer.test.tsx`
Expected: PASS.

### Task 6: Remove unrelated controls and deliver responsive polish

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/app/__tests__/AppLapSource.test.tsx`

- [ ] **Step 1: Add a failing layout test**

Verify the workspace inspector is absent when the active tab is Lap Analysis and remains present on Overview/Charts.

- [ ] **Step 2: Implement the dedicated analysis layout**

Apply `workspace-grid-laps` while Lap Analysis is active, span the analysis body across the freed inspector column, and do not render `WorkspaceStatus` for this tab.

- [ ] **Step 3: Add responsive and interaction styles**

Use a map/opportunity split above 1180 px, stack below it, provide 44 px touch targets for opportunity cards and view tabs, keep chart height useful on mobile, and provide visible focus states plus reduced-motion-safe transitions.

- [ ] **Step 4: Run the app-focused tests**

Run: `pnpm test src/app/__tests__/AppLapSource.test.tsx src/components/__tests__/LapAnalysis.test.tsx`
Expected: PASS.

### Task 7: Verify the supplied VTA and deploy

**Files:**
- Modify: `tests/analyzer.spec.ts`
- Modify: `README.md` only if the user-facing workflow changed enough to require instructions.

- [ ] **Step 1: Add/adjust the end-to-end primary-flow assertion**

The E2E test must load a representative recording, open Lap Analysis, assert Insights is default, select a ranked opportunity, switch chart axis, and confirm Setup contains the remembered partial-lap policy.

- [ ] **Step 2: Run the complete automated gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`
Expected: all commands exit 0.

- [ ] **Step 3: Run browser QA with the supplied file**

Load `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`, verify the detected 7 complete and 2 partial laps, confirm ranked section losses render, confirm a card/map selection scopes the telemetry chart, drag zoom and brush a range, verify the map/segment updates, then inspect 1440 px and mobile-width layouts.

- [ ] **Step 4: Commit and push the feature**

```bash
git add src tests docs README.md
git commit -m "feat: prioritize lap time-loss opportunities"
git push -u origin feat/opportunity-first-analysis
```

- [ ] **Step 5: Merge to `main` and verify GitHub Pages**

Merge only after the complete gate passes, push `main`, wait for the Pages workflow, then smoke-test `https://woo4826.github.io/openvta-analyzer/` with the production base path.
