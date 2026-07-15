# Spatial Segment Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Execution override (2026-07-15):** The primary agent implements and verifies every code change directly. Subagents are reserved for post-implementation usability/spec/code-quality evaluation; feedback fixes remain the primary agent's responsibility.

**Goal:** Replace the Coach/opportunity-first lap screen with a map-first segment workbench that synchronizes static track presets, editable scopes, every traversing lap trajectory, Time Slip Rate, telemetry graphs, and per-lap records.

**Architecture:** Add a static-preset loader ahead of the existing IndexedDB/OSM/generated fallback, then introduce a pure segment-analysis domain API and a controlled `AnalysisScope`. Compose focused map, telemetry, ribbon, and table components around that state while keeping track/gate editing in a compact Setup disclosure and preserving the zero-backend workflow.

**Tech Stack:** React 18, TypeScript, ECharts 5, MapLibre GL 4, IndexedDB, Vite, Vitest, Testing Library, Aside browser QA, GitHub Pages.

---

## File map

- Create `src/domain/trackPresetIndex.ts`: validate and load hosted index/profile files with `BASE_URL`-safe URLs.
- Create `src/domain/__tests__/trackPresetIndex.test.ts`: index validation, URL resolution, candidate filtering, failure fallback.
- Create `src/app/useTrackPresets.ts`: coordinate hosted presets with local overrides and expose source/status.
- Create `src/app/__tests__/useTrackPresets.test.tsx`: precedence, override, reset, and network failure behavior.
- Modify `src/domain/trackStorage.ts`: persist local override provenance without changing TrackProfile v1 exports.
- Add `public/tracks/index.v1.json` and `public/tracks/profiles/inje-speedium-full.2026-07-15.json`.
- Create `src/domain/segmentAnalysis.ts`: shared scope, interpolated trajectories, driven distance, shortest-path tag, Time Slip Rate, signed offset, coverage.
- Create `src/domain/__tests__/segmentAnalysis.test.ts`: boundary interpolation, partials, distance, loss rate, offset, confidence, scope adapter.
- Create `src/app/useSegmentWorkbench.ts`: controlled focus/reference/overlay/filter/scope state.
- Create `src/app/__tests__/useSegmentWorkbench.test.tsx`: state transitions and reference normalization.
- Modify `src/components/RouteMap.tsx`: styled lap paths, Time Slip Rate heat segments, dual Ghost markers, map-progress selection.
- Create `src/components/SegmentTrajectoryMap.tsx` and its component test.
- Create `src/components/segmentTelemetryOptions.ts`: four synchronized ECharts grids.
- Create `src/components/SegmentTelemetryChart.tsx` and its component test.
- Create `src/components/SegmentScopeRibbon.tsx`, `SegmentLapTable.tsx`, and tests.
- Create `src/components/SegmentAnalysisWorkbench.tsx` and its integration test.
- Modify `src/components/LapAnalysis.tsx`: compose the workbench and retain Setup tools without Coach/Opportunity views.
- Remove production imports of `LapOpportunityOverview.tsx`, `opportunityAnalysis.ts`, and `opportunityVisuals.ts`; delete them and their tests when unused.
- Modify `src/app/useLapWorkspace.ts`: static-preset priority and local-override lifecycle.
- Modify `src/i18n/lapLocales.ts`, `src/styles.css`, `tests/analyzer.spec.ts`, `README.md`, and project handoff docs.

### Task 1: Load hosted track presets and local overrides

**Files:**
- Create: `src/domain/trackPresetIndex.ts`
- Create: `src/domain/__tests__/trackPresetIndex.test.ts`
- Create: `src/app/useTrackPresets.ts`
- Create: `src/app/__tests__/useTrackPresets.test.tsx`
- Modify: `src/domain/trackStorage.ts`
- Modify: `src/domain/__tests__/trackStorage.test.ts`
- Create: `public/tracks/index.v1.json`
- Create: `public/tracks/profiles/inje-speedium-full.2026-07-15.json`

- [ ] **Step 1: Write failing index-parser and candidate tests**

```ts
it("resolves profile URLs under the GitHub Pages base path", () => {
  const index = parseTrackPresetIndex(validIndex);
  expect(resolveTrackPresetUrl("/openvta-analyzer/", index.entries[0].href))
    .toBe("/openvta-analyzer/tracks/profiles/inje-speedium-full.2026-07-15.json");
});

it("filters the index before profile fetches", () => {
  expect(candidateTrackPresets(index.entries, recordingSummary))
    .toEqual([expect.objectContaining({ id: "kr-inje-speedium-full" })]);
});

it("rejects duplicate ids, unsafe hrefs, invalid bounds, and unsupported versions", () => {
  expect(() => parseTrackPresetIndex(invalidIndex)).toThrow();
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm test src/domain/__tests__/trackPresetIndex.test.ts`

Expected: FAIL because `trackPresetIndex.ts` does not exist.

- [ ] **Step 3: Implement the index contract and loader**

```ts
export interface TrackPresetIndexEntry {
  id: string;
  venueName: string;
  layoutName: string;
  href: string;
  bbox: [number, number, number, number];
  lengthMeters: number;
  direction: TrackDirection;
  revision: string;
  quality: "curated" | "generated";
}

export interface TrackPresetIndexV1 {
  schemaVersion: 1;
  kind: "openvta-track-index";
  generatedAt: string;
  entries: TrackPresetIndexEntry[];
}

export async function loadHostedTrackPresets(
  points: GpsPoint[],
  baseUrl = import.meta.env.BASE_URL,
  request: typeof fetch = fetch,
): Promise<TrackProfileV1[]>;
```

Validate every field, reject absolute/cross-origin/path-traversal `href` values, filter by expanded recording bounds and estimated circuit length, fetch only candidates, validate each profile with `validateTrackProfile`, and skip individual failures without throwing away valid candidates.

- [ ] **Step 4: Prove local override precedence and reset with failing hook/storage tests**

```tsx
expect(result.current.profiles[0]).toMatchObject({
  profile: localOverride,
  origin: "local-override",
});
await act(() => result.current.resetOverride(localOverride.id));
expect(result.current.profiles[0]).toMatchObject({
  profile: hostedProfile,
  origin: "built-in",
});
```

Run: `pnpm test src/app/__tests__/useTrackPresets.test.tsx src/domain/__tests__/trackStorage.test.ts`

Expected: FAIL because override provenance/reset APIs do not exist.

- [ ] **Step 5: Implement preset coordination**

`useTrackPresets(points)` returns effective profiles plus `built-in`, `local-override`, `imported`, `osm`, or `generated` origin. Keep TrackProfile v1 JSON unchanged; store provenance in a separate IndexedDB object store keyed by profile ID. Upgrade the database transactionally and retain the current memory fallback.

`resetOverride(id)` deletes the local profile only when a hosted profile with the same ID exists. Static fetch errors become a status value and never block OSM/generated fallback.

- [ ] **Step 6: Add the Inje static files and asset-integrity test**

The index entry is exactly:

```json
{
  "id": "kr-inje-speedium-full",
  "venueName": "Inje Speedium",
  "layoutName": "Full Course",
  "href": "profiles/inje-speedium-full.2026-07-15.json",
  "bbox": [128.27, 37.99, 128.30, 38.01],
  "lengthMeters": 3915,
  "direction": "clockwise",
  "revision": "2026-07-15",
  "quality": "curated"
}
```

Build the profile from the existing OSM lookup result, retain ODbL attribution and element IDs, add the verified start/finish and 27 analysis sections, and do not copy the supplied recording trace. The test reads both public JSON files, validates the profile, checks unique section IDs, non-overlap, coverage, attribution, and index/profile ID equality.

- [ ] **Step 7: Run focused and baseline tests, then commit**

Run: `pnpm test src/domain/__tests__/trackPresetIndex.test.ts src/app/__tests__/useTrackPresets.test.tsx src/domain/__tests__/trackStorage.test.ts src/domain/__tests__/trackProfile.test.ts`

Expected: PASS.

Commit: `feat: load hosted track presets with local overrides`

### Task 2: Build the segment-analysis domain API

**Files:**
- Create: `src/domain/segmentAnalysis.ts`
- Create: `src/domain/__tests__/segmentAnalysis.test.ts`
- Modify: `src/domain/sectionAnalysis.ts`
- Modify: `src/domain/__tests__/sectionAnalysis.test.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Write failing scope and trajectory tests**

```ts
const scope: AnalysisScope = { kind: "section", sectionId: "c6" };
const result = analyzeSegmentScope(points, laps, line, sections, scope, "lap-2", true);

expect(result.range).toEqual({ startDistanceMeters: 1700, endDistanceMeters: 2040 });
expect(result.laps.find((lap) => lap.lapId === "lap-1")?.trajectory.at(0)?.distanceMeters).toBe(0);
expect(result.laps.find((lap) => lap.lapId === "lap-1")?.trajectory.at(-1)?.distanceMeters).toBe(340);
expect(result.laps.find((lap) => lap.lapId === "partial-with-coverage")?.fromPartialLap).toBe(true);
expect(result.laps.some((lap) => lap.lapId === "partial-without-exit")).toBe(false);
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm test src/domain/__tests__/segmentAnalysis.test.ts`

Expected: FAIL because the domain API does not exist.

- [ ] **Step 3: Define the public analysis types**

```ts
export type AnalysisScope =
  | { kind: "whole-lap" }
  | { kind: "section"; sectionId: string }
  | { kind: "range"; startDistanceMeters: number; endDistanceMeters: number; source: "map" | "chart" | "manual" };

export interface ScopeRange {
  startDistanceMeters: number;
  endDistanceMeters: number;
}

export interface SegmentTrajectorySample extends LapComparisonSample {
  pathDistanceMeters: number;
  signedOffsetMeters: number;
  lossRateSecondsPer100m?: number;
  accuracyMeters?: number;
}

export interface SegmentLapRecord {
  lapId: string;
  completion: LapCompletion;
  validity: LapValidity;
  coverage: "complete" | "partial" | "none";
  eligibleForBest: boolean;
  durationSeconds?: number;
  deltaBestSeconds?: number;
  drivenDistanceMeters?: number;
  deltaShortestMeters?: number;
  entrySpeedKmh?: number;
  minimumSpeedKmh?: number;
  averageSpeedKmh?: number;
  exitSpeedKmh?: number;
  maxLateralG?: number;
  maxDecelerationG?: number;
  peakLossRateSecondsPer100m?: number;
  gpsConfidence: "high" | "medium" | "low" | "unknown";
  trajectory: SegmentTrajectorySample[];
}

export interface SegmentAnalysisResult {
  scope: AnalysisScope;
  range: { startDistanceMeters: number; endDistanceMeters: number };
  referenceLapId?: string;
  fastestLapId?: string;
  shortestLapId?: string;
  records: SegmentLapRecord[];
}
```

- [ ] **Step 4: Write failing metric tests**

Prove boundary interpolation, actual driven distance, shortest-path delta, signed left/right offset, Delta-T rebasing, loss-rate sign/masking, GPS confidence, and all partial-policy combinations. Include a regression where the fastest segment is longer than the shortest path.

```ts
expect(result.fastestLapId).toBe("wide-fast");
expect(result.shortestLapId).toBe("tight-slow");
expect(record.peakLossRateSecondsPer100m).toBeGreaterThan(0);
expect(lowSpeedRecord.peakLossRateSecondsPer100m).toBeUndefined();
```

- [ ] **Step 5: Implement metrics from progress-aligned samples**

Move the reusable monotonic progress/interpolation helpers from `sectionAnalysis.ts` into exported internal helpers in `segmentAnalysis.ts` or a focused `trackProgress.ts` if needed. Use a 5 m output grid, cumulative haversine driven distance, cross-product sign against the analysis-line segment, and a centered 25 m Delta-T slope for `s/100m`. Never use raw array indexes as cross-lap progress.

Provide:

```ts
export function analysisScopeRange(scope: AnalysisScope, sections: TrackSection[], lineLengthMeters: number): ScopeRange;
export function analyzeSegmentScope(...): SegmentAnalysisResult;
export function scopeSourceIndexes(record: SegmentLapRecord): { startIndex: number; endIndex: number } | undefined;
```

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm test src/domain/__tests__/segmentAnalysis.test.ts src/domain/__tests__/sectionAnalysis.test.ts src/domain/__tests__/geometry.test.ts`

Expected: PASS.

Commit: `feat: analyze synchronized lap segments and trajectories`

### Task 3: Add controlled workbench state

**Files:**
- Create: `src/app/useSegmentWorkbench.ts`
- Create: `src/app/__tests__/useSegmentWorkbench.test.tsx`
- Modify: `src/app/useLapWorkspace.ts`
- Modify: `src/app/__tests__/useLapWorkspace.test.tsx`

- [ ] **Step 1: Write failing reducer/hook tests**

```tsx
expect(result.current.scope).toEqual({ kind: "whole-lap" });
act(() => result.current.selectSection("c6"));
expect(result.current.scope).toEqual({ kind: "section", sectionId: "c6" });
act(() => result.current.setFilter("corners"));
expect(result.current.navigationSections.every((section) => section.kind !== "straight")).toBe(true);
act(() => result.current.setFocusedLap("lap-7"));
expect(result.current.overlayLapIds).toContain("lap-7");
expect(result.current.overlayLapIds).toContain(result.current.referenceLapId);
expect(result.current.overlayLapIds).toHaveLength(5);
```

Also prove `whole-lap` remains selected, a straight cannot survive the corners filter, selected-scope fastest is the default reference, invalid/partial references normalize safely, and graph brush creates a `range` scope.

- [ ] **Step 2: Confirm RED**

Run: `pnpm test src/app/__tests__/useSegmentWorkbench.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement one state owner**

```ts
export type SegmentFilter = "all" | "corners" | "straights";

export interface SegmentWorkbenchState {
  scope: AnalysisScope;
  filter: SegmentFilter;
  focusedLapId?: string;
  referenceLapId?: string;
  overlayLapIds: string[];
  axis: "distance" | "time";
}
```

The hook derives `SegmentAnalysisResult`, navigation sections, and a scope-to-`ActiveSegment` adapter. Persist only the partial-lap policy and user profile overrides; keep transient cursor/zoom/range state per loaded file.

- [ ] **Step 4: Integrate preset priority in `useLapWorkspace`**

Hosted presets are considered after explicit/local profiles and before cached/live OSM. Local override with the same ID wins. Hosted errors do not change the existing OSM/generated flow. Add `profileOrigin`, `resetProfileOverride`, and `saveRangeAsSection` to `LapWorkspace`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test src/app/__tests__/useSegmentWorkbench.test.tsx src/app/__tests__/useLapWorkspace.test.tsx`

Expected: PASS.

Commit: `feat: centralize segment workbench state`

### Task 4: Render all-lap trajectories, heat, and Ghost markers

**Files:**
- Modify: `src/components/RouteMap.tsx`
- Modify: `src/components/__tests__/RouteMapSources.test.tsx`
- Create: `src/components/SegmentTrajectoryMap.tsx`
- Create: `src/components/__tests__/SegmentTrajectoryMap.test.tsx`

- [ ] **Step 1: Write failing map-source tests**

```tsx
expect(mapSources.get("lap-overlays")?.setData).toHaveBeenCalledWith(expect.objectContaining({
  features: expect.arrayContaining([
    expect.objectContaining({ properties: expect.objectContaining({ lapId: "lap-7", opacity: 0.18 }) }),
  ]),
}));
expect(mapSources.get("loss-rate-segments")?.setData).toHaveBeenCalled();
expect(screen.getByLabelText("Lap 4 focused Ghost")).toBeVisible();
expect(screen.getByLabelText("Lap 2 reference Ghost")).toBeVisible();
```

Prove the SVG fallback renders the same seven trajectories, heat segments, two Ghosts, section click, and cursor selection without tiles.

- [ ] **Step 2: Confirm RED**

Run: `pnpm test src/components/__tests__/RouteMapSources.test.tsx src/components/__tests__/SegmentTrajectoryMap.test.tsx`

Expected: FAIL because heat segments/Ghosts do not exist.

- [ ] **Step 3: Extend map contracts**

```ts
export interface LapMapOverlay {
  id: string;
  color: string;
  points: GpsPoint[];
  width?: number;
  opacity?: number;
  dashArray?: number[];
}

export interface MapHeatSegment {
  id: string;
  coordinates: [Position, Position];
  color: string;
  width: number;
  opacity: number;
}

export interface MapGhostMarker {
  id: string;
  label: string;
  coordinate: Position;
  color: string;
}
```

Publish separate GeoJSON sources/layers for overlays, heat segments, and Ghosts. Preserve the current selected-point marker and section layers. Never remove the coordinate fallback.

- [ ] **Step 4: Implement `SegmentTrajectoryMap`**

Convert all `coverage === "complete"` records to low-opacity overlays, emphasize focused/reference records, derive heat colors from focused-lap loss rate, place Ghosts at shared progress, and suppress the envelope/shortest badge when GPS confidence is low. The wrapper owns presentation mapping only; all calculations come from `SegmentAnalysisResult`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test src/components/__tests__/RouteMapSources.test.tsx src/components/__tests__/SegmentTrajectoryMap.test.tsx`

Expected: PASS.

Commit: `feat: map segment trajectories and time slip rate`

### Task 5: Build synchronized segment telemetry graphs

**Files:**
- Create: `src/components/segmentTelemetryOptions.ts`
- Create: `src/components/SegmentTelemetryChart.tsx`
- Create: `src/components/__tests__/SegmentTelemetryChart.test.tsx`
- Modify: `src/components/ChartPanel.tsx`
- Modify: `src/components/chartInteraction.ts`

- [ ] **Step 1: Write failing option and interaction tests**

```ts
const option = buildSegmentTelemetryOption(result, overlayLapIds, "distance");
expect(option.grid).toHaveLength(4);
expect(seriesNames(option)).toEqual(expect.arrayContaining([
  "Lap 4 Speed", "Lap 4 Elapsed time", "Lap 4 Delta-T", "Lap 4 Loss rate",
]));
expect(option.dataZoom).toEqual(expect.arrayContaining([
  expect.objectContaining({ type: "inside", xAxisIndex: [0, 1, 2, 3] }),
]));
expect(option.axisPointer).toEqual(expect.objectContaining({ link: [{ xAxisIndex: "all" }] }));
```

Prove every point is `[x, y, sourceIndex]`, time axis changes x values, focused/reference remain visible, other overlays stay at five maximum, brush emits an ordered custom progress range, and reset restores the saved section.

- [ ] **Step 2: Confirm RED**

Run: `pnpm test src/components/__tests__/SegmentTelemetryChart.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the four-grid option**

Speed and elapsed time use absolute values; Delta-T and loss rate use zero baselines. Legends scroll, tooltips display lap, progress/time, value, unit, and GPS source index. Link all grids with common axis pointer and zoom. Use a visible section split band and provide explicit `Select range`, `Zoom`, and `Reset` controls so drag meaning is not ambiguous.

- [ ] **Step 4: Extend `ChartPanel` only for required progress-range events**

Keep existing source-index brush behavior. Add a typed callback that receives chart-domain min/max from a line-X brush without breaking legacy charts:

```ts
onBrushRange?: (start: number, end: number) => void;
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm test src/components/__tests__/SegmentTelemetryChart.test.tsx src/components/__tests__/ChartPanel.test.ts src/components/__tests__/Charts.test.tsx`

Expected: PASS.

Commit: `feat: add synchronized segment telemetry graphs`

### Task 6: Build ribbon, per-lap table, and the B-layout workbench

**Files:**
- Create: `src/components/SegmentScopeRibbon.tsx`
- Create: `src/components/SegmentLapTable.tsx`
- Create: `src/components/SegmentAnalysisWorkbench.tsx`
- Create: `src/components/__tests__/SegmentScopeRibbon.test.tsx`
- Create: `src/components/__tests__/SegmentLapTable.test.tsx`
- Create: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Modify: `src/components/LapAnalysis.tsx`
- Modify: `src/components/__tests__/LapAnalysis.test.tsx`
- Modify: `src/i18n/lapLocales.ts`

- [ ] **Step 1: Write failing accessibility and synchronization tests**

```tsx
expect(screen.getByRole("button", { name: /Corner 6/ })).toHaveAttribute("aria-pressed", "true");
expect(screen.getAllByRole("row")).toHaveLength(10); // header + 7 complete + 2 partial
await user.click(screen.getByRole("row", { name: /Lap 6.*17.701.*6.194/ }));
expect(onFocusedLapChange).toHaveBeenCalledWith("lap-6");
expect(screen.getByText("Fastest path")).not.toBe(screen.getByText("Shortest recorded path"));
```

Also prove corner/straight filters cannot leave an incompatible scope selected, partial rows remain visible, missing metrics have reasons, and mobile details can expand without horizontal overflow.

- [ ] **Step 2: Confirm RED**

Run: `pnpm test src/components/__tests__/SegmentScopeRibbon.test.tsx src/components/__tests__/SegmentLapTable.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement focused components**

`SegmentScopeRibbon` owns only navigation/filter controls. `SegmentLapTable` owns sorting, desktop column visibility, mobile row details, and row focus. `SegmentAnalysisWorkbench` composes top controls, ribbon, trajectory map, evidence inspector, telemetry chart, distribution summary, and table from `useSegmentWorkbench`.

Use explicit text for status and eligibility; never communicate validity or gain/loss using color alone.

- [ ] **Step 4: Replace the Opportunity/Coach primary view**

Remove `LapAnalysisView`, `analyzeLapOpportunities`, `LapOpportunityOverview`, and default Opportunity selection. Render `SegmentAnalysisWorkbench` whenever the profile, analysis line, and laps exist. When they do not, render a focused setup empty state.

Keep track import/export, start/finish editing, timing gates, boundary correction, partial policy, and section editor in one `Setup` dialog or disclosure opened from the workbench top bar. Section-map/table/ribbon selection uses the same `AnalysisScope`.

- [ ] **Step 5: Remove unused Coach/Opportunity code**

Delete `LapOpportunityOverview.tsx`, `opportunityAnalysis.ts`, `opportunityVisuals.ts`, and tests only after `rg` proves there are no production imports. Remove their translations and add complete Korean/English workbench copy with English fallback for secondary locales.

- [ ] **Step 6: Verify and commit**

Run: `pnpm test src/components/__tests__/SegmentScopeRibbon.test.tsx src/components/__tests__/SegmentLapTable.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/components/__tests__/LapAnalysis.test.tsx src/i18n/__tests__/i18n.test.ts`

Expected: PASS.

Commit: `feat: replace coach view with segment workbench`

### Task 7: Finish profile editing, responsive styling, and exports

**Files:**
- Modify: `src/components/LapAnalysis.tsx`
- Modify: `src/app/useLapWorkspace.ts`
- Modify: `src/domain/lapExport.ts`
- Modify: `src/domain/__tests__/lapExport.test.ts`
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `docs/project-handoff/product-and-ux.md`
- Modify: `docs/project-handoff/architecture.md`

- [ ] **Step 1: Write failing editing and export tests**

Prove saving a custom A–B scope appends a user section, editing a built-in profile creates a local override, reset restores built-in data, start/finish confirmation clears boundary/validity overrides and recalculates, and segment export preserves canonical English keys.

```ts
expect(JSON.parse(exported)).toMatchObject({
  schemaVersion: 1,
  kind: "openvta-segment-analysis",
  scope: { kind: "section", sectionId: "c6" },
  laps: [expect.objectContaining({ lapId: expect.any(String), drivenDistanceMeters: expect.any(Number) })],
});
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm test src/app/__tests__/useLapWorkspace.test.tsx src/domain/__tests__/lapExport.test.ts`

Expected: FAIL for the missing override/range/export behavior.

- [ ] **Step 3: Implement edit lifecycle and export**

Create local overrides on first edit of a hosted profile, preserve profile ID and source attribution, update `updatedAt`, and expose reset/export. Add `saveRangeAsSection(name, kind, range)` with clamping, non-zero length, stable user ID, and overlap validation. Start/finish changes show before/after lap counts and fastest time after atomic recompute.

- [ ] **Step 4: Implement responsive/accessibility styling**

Desktop: map/evidence split, full-width graphs and table. Tablet: stacked map and evidence. Mobile: sticky `Map / Graphs / Laps` view switch, compact ribbon, five default table columns, expandable details. All controls meet 44 px touch targets, focus rings remain visible, reduced-motion is respected, and no component creates page-level horizontal overflow.

- [ ] **Step 5: Update documentation and verify**

Run: `pnpm test src/app/__tests__/useLapWorkspace.test.tsx src/domain/__tests__/lapExport.test.ts src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`

Expected: PASS.

Commit: `feat: finish editable segment analysis workflow`

### Task 8: Real-file regression, usability loops, release gate, and deployment

**Files:**
- Modify: `tests/analyzer.spec.ts`
- Add or modify focused real-file regression tests without committing the private VTA.
- Modify code/tests identified by usability reviewers.

- [ ] **Step 1: Add an E2E primary-flow test**

The generated E2E fixture must load Lap Analysis, select C6 from ribbon and map, focus another lap from the table, verify reference/graph/map changes, switch distance/time axis, brush a custom range, open Setup, toggle partial Best policy, and exercise static-profile override/reset using the configured GitHub Pages base path.

- [ ] **Step 2: Run the supplied VTA through the local app**

Load `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta` only in local QA. Verify 1,589 GPS points, 7 complete and 2 partial laps, 27 sections, and the C6 values from the approved design spec. Capture no raw coordinates in logs, screenshots, fixtures, or commits.

- [ ] **Step 3: Dispatch a fresh usability-review subagent**

The reviewer inspects desktop and mobile Aside snapshots and scores discoverability, section selection, focus/reference clarity, graph readability, partial-lap handling, preset/edit/reset clarity, and accessibility from 1–5. Any Critical/Important issue or category below 4 is a failing review.

- [ ] **Step 4: Repeat primary-agent feedback fixes and independent review until passing**

For each failed review, the primary agent implements the exact findings with TDD for behavior changes, commits the fixes, then dispatches another fresh usability reviewer. Continue until no Critical/Important issue remains and every category scores at least 4.

- [ ] **Step 5: Run the complete fresh verification gate**

Run each command separately and require exit code 0:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Use Aside to verify 1440 px and 320 px layouts, section/map/graph/table synchronization, generated-track fallback, built-in/local override/reset, no console errors, and no horizontal overflow.

- [ ] **Step 6: Dispatch final spec and code-quality reviewers**

Review the complete diff against `docs/superpowers/specs/2026-07-15-spatial-segment-workbench-design.md`. Fix and re-review every Critical/Important issue before release.

- [ ] **Step 7: Push, merge, and verify GitHub Pages**

Push `codex/segment-analysis-workbench`, merge only after the full gate and review loop pass, push `main`, wait for the Pages workflow, and smoke-test `https://woo4826.github.io/openvta-analyzer/` including its `/openvta-analyzer/` asset base.
