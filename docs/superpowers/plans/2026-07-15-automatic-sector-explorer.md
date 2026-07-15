# Automatic Sector and Lap Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically derive reusable corner/straight sectors, compare every lap by sector with distance-based Speed/Delta-T graphs, and manage predefined TrackProfile JSON files from a new Track Library menu.

**Architecture:** Add isolated domain modules for automatic section generation, centreline-progress projection, section metrics, and catalog parsing. Extend the existing per-file lap workspace to seed and apply profiles, then compose two focused UI components—Track Library and Lap Explorer—without moving VTA data off-device.

**Tech Stack:** TypeScript, React 18, ECharts, IndexedDB, Vite, Vitest/Testing Library, existing GitHub Pages workflows.

---

### Task 1: Extend TrackProfile and generate automatic sectors

**Files:**
- Create: `src/domain/automaticSections.ts`
- Create: `src/domain/__tests__/automaticSections.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/trackProfile.ts`
- Modify: `src/domain/__tests__/trackProfile.test.ts`
- Modify: `src/domain/lapAnalysis.ts`

- [ ] **Step 1: Write failing profile compatibility tests**

```ts
it("round-trips an analysis line and automatic section metadata", () => {
  const value = profile({
    analysisLine: line([[128, 38], [128.001, 38.001]]),
    sections: [{
      id: "auto-straight-0-100",
      name: "Straight 1",
      kind: "straight",
      startDistanceMeters: 0,
      endDistanceMeters: 100,
      source: "automatic",
      confidence: 0.82,
    }],
  });
  expect(parseTrackProfile(exportTrackProfile(value)).profile).toEqual(value);
});

it("rejects automatic-section confidence outside zero through one", () => {
  expect(validateTrackProfile(profile({ sections: [section({ confidence: 1.1 })] })).error).toMatch(/section/i);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm test -- src/domain/__tests__/trackProfile.test.ts`

Expected: FAIL because `analysisLine`, `source`, and `confidence` are discarded.

- [ ] **Step 3: Add additive TrackProfile v1 fields and strict parsing**

```ts
export interface TrackSection {
  id: string;
  name: string;
  kind: TrackSectionKind;
  startDistanceMeters: number;
  endDistanceMeters: number;
  source?: "automatic" | "user";
  confidence?: number;
}

export interface TrackProfileV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  centerline: LineString;
  analysisLine?: LineString;
  // existing fields remain unchanged
}
```

Parse `analysisLine` as a valid two-or-more-point LineString. Preserve `source` only for `automatic` or `user`; require finite `confidence` in `[0, 1]` when present.

- [ ] **Step 4: Write failing deterministic generation tests**

```ts
it("returns a complete non-overlapping partition with stable ids", () => {
  const result = generateAutomaticSections(samplesForStraightLeftStraightRight());
  expect(result[0].startDistanceMeters).toBe(0);
  expect(result.at(-1)?.endDistanceMeters).toBe(1000);
  expect(result.every((section, index) => index === 0 || section.startDistanceMeters === result[index - 1].endDistanceMeters)).toBe(true);
  expect(result.map((section) => section.kind)).toEqual(expect.arrayContaining(["straight", "corner-left", "corner-right"]));
  expect(generateAutomaticSections(samplesForStraightLeftStraightRight()).map((section) => section.id))
    .toEqual(result.map((section) => section.id));
});

it("splits a straight longer than 500 metres", () => {
  expect(generateAutomaticSections(straightSamples(1200)).filter((section) => section.kind === "straight").length).toBe(3);
});
```

- [ ] **Step 5: Run the generation tests and verify they fail**

Run: `pnpm test -- src/domain/__tests__/automaticSections.test.ts`

Expected: FAIL because `generateAutomaticSections` does not exist.

- [ ] **Step 6: Implement automatic generation and compatibility wrapper**

```ts
export function generateAutomaticSections(samples: LapDistanceSample[]): TrackSection[];
export function validateSectionPartition(sections: TrackSection[], totalDistanceMeters: number): boolean;
```

Use five-sample smoothing, signed curvature, 20 m short-range merging, 500 m straight splitting, full-range partition filling, and IDs derived from kind plus rounded start/end distance. Keep `proposeTrackSections(centerline)` as a compatibility wrapper that constructs zero-speed samples and delegates to the new generator.

- [ ] **Step 7: Run focused tests and commit**

Run: `pnpm test -- src/domain/__tests__/automaticSections.test.ts src/domain/__tests__/trackProfile.test.ts src/domain/__tests__/lapAnalysis.test.ts`

Expected: PASS.

```bash
git add src/domain
git commit -m "feat: generate automatic track sectors"
```

### Task 2: Analyse every lap by centreline-progress sector

**Files:**
- Create: `src/domain/sectionAnalysis.ts`
- Create: `src/domain/__tests__/sectionAnalysis.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/geometry.ts`
- Create: `src/domain/__tests__/geometry.test.ts`

- [ ] **Step 1: Write failing projection and metrics tests**

```ts
it("projects complete laps to the same section despite driven-distance variation", () => {
  const results = analyzeLapSections(pointsForTwoLaps(), completeLaps(), analysisLine(), sections(), false);
  expect(results.filter((result) => result.sectionId === "corner-1")).toHaveLength(2);
  expect(results.every((result) => result.entrySpeedKmh > 0 && result.durationSeconds > 0)).toBe(true);
});

it("includes only fully traversed partial sections and honours best eligibility", () => {
  const off = analyzeLapSections(pointsForPartialEnd(), partialEndLap(), analysisLine(), sections(), false);
  const on = analyzeLapSections(pointsForPartialEnd(), partialEndLap(), analysisLine(), sections(), true);
  expect(off.every((result) => result.fromPartialLap && !result.eligibleForBest)).toBe(true);
  expect(on.every((result) => result.eligibleForBest)).toBe(true);
});

it("rebases scoped delta time to zero at the section start", () => {
  const rows = scopedLapComparison(pointsForTwoLaps(), slowerLap(), referenceLap(), analysisLine(), section());
  expect(rows[0].deltaSeconds).toBeCloseTo(0);
  expect(rows.at(-1)?.deltaSeconds).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- src/domain/__tests__/sectionAnalysis.test.ts`

Expected: FAIL because the section-analysis API is missing.

- [ ] **Step 3: Add geometry projection and result types**

```ts
export interface LineProgressProjection {
  distanceMeters: number;
  offsetMeters: number;
}

export interface LapSectionResult {
  id: string;
  lapId: string;
  sectionId: string;
  name: string;
  kind: TrackSectionKind;
  durationSeconds: number;
  deltaBestSeconds?: number;
  entrySpeedKmh: number;
  minimumSpeedKmh: number;
  averageSpeedKmh: number;
  maximumSpeedKmh: number;
  exitSpeedKmh: number;
  maxLateralG?: number;
  maxDecelerationG?: number;
  fromPartialLap: boolean;
  eligibleForBest: boolean;
}
```

Implement `projectCoordinateToLineProgress(coordinate, line)` using the closest point on every segment and cumulative haversine distance.

- [ ] **Step 4: Implement monotonic progress, metrics, and scoped graph samples**

```ts
export function analyzeLapSections(
  points: GpsPoint[],
  laps: LapResult[],
  analysisLine: LineString,
  sections: TrackSection[],
  includePartialLapSections: boolean,
): LapSectionResult[];

export function scopedLapComparison(
  points: GpsPoint[],
  lap: LapResult,
  reference: LapResult | undefined,
  analysisLine: LineString,
  section?: TrackSection,
  spacingMeters?: number,
): LapComparisonSample[];

export function automaticTheoreticalBestSeconds(results: LapSectionResult[], sectionCount: number): number | undefined;
```

Reject `partial-both`, require both scope boundaries inside the observed monotonic progress, interpolate boundary time/speed, and subtract scope-start delta from every comparison sample.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm test -- src/domain/__tests__/geometry.test.ts src/domain/__tests__/sectionAnalysis.test.ts`

Expected: PASS.

```bash
git add src/domain
git commit -m "feat: analyze laps by automatic sector"
```

### Task 3: Add atomic TrackProfile catalog management

**Files:**
- Create: `src/domain/trackCatalog.ts`
- Create: `src/domain/__tests__/trackCatalog.test.ts`
- Create: `src/app/useTrackLibrary.ts`
- Create: `src/app/__tests__/useTrackLibrary.test.tsx`
- Modify: `src/domain/trackStorage.ts`
- Modify: `src/domain/__tests__/trackStorage.test.ts`

- [ ] **Step 1: Write failing catalog tests**

```ts
it("imports a single profile or a catalog and rejects duplicate ids atomically", () => {
  expect(parseTrackBundle(exportTrackProfile(profile("inje"))).profiles).toHaveLength(1);
  expect(parseTrackBundle(exportTrackCatalog([profile("inje"), profile("taebaek")])).profiles).toHaveLength(2);
  expect(parseTrackBundle(exportTrackCatalog([profile("inje"), profile("inje")])).error).toMatch(/duplicate/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/domain/__tests__/trackCatalog.test.ts`

Expected: FAIL because the catalog API is missing.

- [ ] **Step 3: Implement catalog parsing/export and batch storage**

```ts
export interface TrackCatalogV1 {
  schemaVersion: 1;
  kind: "openvta-track-catalog";
  tracks: TrackProfileV1[];
}

export function parseTrackBundle(text: string): { profiles?: TrackProfileV1[]; error?: string };
export function exportTrackCatalog(profiles: TrackProfileV1[]): string;
export async function saveTrackProfiles(profiles: TrackProfileV1[]): Promise<void>;
```

Validate every entry before any write. Use one IndexedDB transaction and update the memory fallback only with the complete validated list.

- [ ] **Step 4: Write and implement the library hook tests**

```ts
it("refreshes after multi-file import and delete", async () => {
  const { result } = renderHook(() => useTrackLibrary());
  await act(() => result.current.importTexts([singleProfileText, catalogText]));
  expect(result.current.profiles.map((item) => item.id)).toEqual(["inje", "taebaek"]);
  await act(() => result.current.remove("inje"));
  expect(result.current.profiles.map((item) => item.id)).toEqual(["taebaek"]);
});
```

Expose `profiles`, `busy`, `error`, `refresh`, `importTexts`, and `remove`. Keep localized presentation errors out of the hook.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- src/domain/__tests__/trackCatalog.test.ts src/domain/__tests__/trackStorage.test.ts src/app/__tests__/useTrackLibrary.test.tsx`

Expected: PASS.

```bash
git add src/domain src/app/useTrackLibrary.ts src/app/__tests__/useTrackLibrary.test.tsx
git commit -m "feat: add track profile catalog storage"
```

### Task 4: Add the Track Library header menu

**Files:**
- Create: `src/components/TrackLibrary.tsx`
- Create: `src/components/__tests__/TrackLibrary.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/useLapWorkspace.ts`
- Modify: `src/app/__tests__/App.test.ts`
- Modify: `src/app/__tests__/useLapWorkspace.test.tsx`

- [ ] **Step 1: Write failing UI and workspace tests**

```tsx
it("opens before a VTA is loaded and imports a catalog", async () => {
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Track Library" }));
  expect(screen.getByRole("dialog", { name: "Track Library" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Apply to current recording" })).toBeDisabled();
});

it("applies a library profile and clears gate-dependent overrides", () => {
  act(() => result.current.applyProfile(profile("inje")));
  expect(result.current.profile?.id).toBe("inje");
  expect(result.current.detection?.boundaries).not.toContainEqual(expect.objectContaining({ source: "manual" }));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/__tests__/TrackLibrary.test.tsx src/app/__tests__/App.test.ts src/app/__tests__/useLapWorkspace.test.tsx`

Expected: FAIL because the menu and `applyProfile` do not exist.

- [ ] **Step 3: Implement the modal and App integration**

`TrackLibrary` receives `open`, `onClose`, `activeFileName`, and `onApply`. It renders multi-file import, per-profile export/delete/apply, catalog export, Escape close, an accessible title, and confirmation before deletion.

Add a header button beside Settings. Mount the modal outside the active-file conditional so import works on the empty-state page.

- [ ] **Step 4: Implement workspace profile application**

```ts
const applyProfile = useCallback((profile: TrackProfileV1) => update((workspace) => ({
  ...workspace,
  profile,
  manualGate: undefined,
  lookupState: "imported",
  lookupMessage: undefined,
  candidates: [],
  boundaryOverrides: [],
  validityOverrides: [],
})), [update]);
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- src/components/__tests__/TrackLibrary.test.tsx src/app/__tests__/App.test.ts src/app/__tests__/useLapWorkspace.test.tsx`

Expected: PASS.

```bash
git add src/components/TrackLibrary.tsx src/components/__tests__/TrackLibrary.test.tsx src/app
git commit -m "feat: add track library menu"
```

### Task 5: Seed and export automatic section analysis

**Files:**
- Modify: `src/app/useLapWorkspace.ts`
- Modify: `src/app/__tests__/useLapWorkspace.test.tsx`
- Modify: `src/domain/lapExport.ts`
- Modify: `src/domain/__tests__/lapExport.test.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Write failing auto-seed and export tests**

```ts
it("automatically seeds analysis sectors from the first valid complete lap", async () => {
  const { result } = renderLapWorkspace(loopPoints());
  act(() => result.current.useSelectedPointAsStartFinish(0));
  await waitFor(() => expect(result.current.profile?.analysisLine?.coordinates.length).toBeGreaterThan(20));
  expect(result.current.profile?.sections.every((section) => section.source === "automatic")).toBe(true);
  expect(result.current.sectionResults.length).toBeGreaterThan(result.current.profile!.sections.length);
});

it("exports canonical section analysis", () => {
  expect(sectionResultsCsv([sectionResult()]).split("\n")[0]).toBe(
    "lapId,sectionId,name,kind,durationSeconds,deltaBestSeconds,entrySpeedKmh,minimumSpeedKmh,averageSpeedKmh,maximumSpeedKmh,exitSpeedKmh,maxLateralG,maxDecelerationG,fromPartialLap,eligibleForBest",
  );
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/app/__tests__/useLapWorkspace.test.tsx src/domain/__tests__/lapExport.test.ts`

Expected: FAIL because automatic seeding and section exports are missing.

- [ ] **Step 3: Add workspace results and safe recalculation**

Expose `sectionResults`, `automaticTheoreticalBestSeconds`, `analysisLine`, `canGenerateAutomaticSections`, and `recalculateAutomaticSections(replaceAll: boolean)`. Seed only when a valid complete representative lap exists and the profile has no sections. Do not overwrite user/imported sections without `replaceAll`.

When editing any section, clamp boundaries to the analysis-line length, maintain start-before-end, set `source: "user"`, and clear confidence.

- [ ] **Step 4: Add section CSV and analysis JSON fields**

Keep existing exports unchanged. Add `sectionResultsCsv` and include `sectionResults` plus `automaticTheoreticalBestSeconds` in the lap-analysis JSON object.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- src/app/__tests__/useLapWorkspace.test.tsx src/domain/__tests__/lapExport.test.ts`

Expected: PASS.

```bash
git add src/app/useLapWorkspace.ts src/app/__tests__/useLapWorkspace.test.tsx src/domain
git commit -m "feat: seed automatic sector analysis"
```

### Task 6: Build the Lap Explorer graph and matrix

**Files:**
- Create: `src/components/LapExplorer.tsx`
- Create: `src/components/__tests__/LapExplorer.test.tsx`
- Modify: `src/components/LapAnalysis.tsx`
- Modify: `src/components/__tests__/LapAnalysis.test.tsx`

- [ ] **Step 1: Write failing explorer tests**

```tsx
it("navigates whole lap, corners, and straights and rebases graph distance", async () => {
  render(<LapExplorer {...props()} />);
  await user.selectOptions(screen.getByLabelText("Analysis scope"), "corner-1");
  expect(screen.getByRole("heading", { name: "Corner 1 lap comparison" })).toBeVisible();
  expect(latestChartOption().series[0].data[0][0]).toBe(0);
  await user.click(screen.getByRole("button", { name: "Next scope" }));
  expect(screen.getByLabelText("Analysis scope")).toHaveValue("straight-2");
});

it("opens a matrix row in the graph and shows every selected lap metric", async () => {
  render(<LapExplorer {...props()} />);
  await user.click(screen.getByRole("button", { name: "Analyze Corner 1" }));
  expect(screen.getByRole("table", { name: "Selected scope lap metrics" })).toHaveTextContent("Lap 1");
  expect(screen.getByRole("table", { name: "Selected scope lap metrics" })).toHaveTextContent("Lap 2");
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/__tests__/LapExplorer.test.tsx`

Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement explorer state and chart options**

The component accepts points, laps, selected lap IDs, primary/reference IDs, analysis line, sections, and section results. Scope state is local and resets to whole lap only when the selected profile changes. Filter buttons limit the scope selector without deleting state.

Build ECharts series with `scopedLapComparison`, two value axes, scroll legend, tooltip, inside zoom, slider zoom, and a toolbox restore action. Section scope data uses local distance beginning at zero and Delta-T beginning at zero.

- [ ] **Step 4: Implement matrix and detailed metrics table**

Rows are sections; columns are selected laps. Cells show formatted duration and signed best delta. A row action changes the graph scope. The detailed table includes duration, best delta, five speed metrics, lateral G, deceleration G, partial status, and eligibility.

- [ ] **Step 5: Replace the old comparison chart and extend exports**

Mount `LapExplorer` after the lap table. Remove `lapComparisonOption` from `LapAnalysis.tsx`, retain existing lap selection and reference controls, add automatic-sector recalculate/replace confirmation, and add the section-analysis CSV export button.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm test -- src/components/__tests__/LapExplorer.test.tsx src/components/__tests__/LapAnalysis.test.tsx`

Expected: PASS.

```bash
git add src/components/LapExplorer.tsx src/components/LapAnalysis.tsx src/components/__tests__
git commit -m "feat: add lap and sector graph explorer"
```

### Task 7: Localize, document, and make the new UI responsive

**Files:**
- Modify: `src/i18n/lapLocales.ts`
- Modify: `src/i18n/locales.ts`
- Modify: `src/i18n/__tests__/i18n.test.ts`
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `tests/analyzer.spec.ts`

- [ ] **Step 1: Add failing localization coverage**

```ts
it.each(["en", "ko", "ja", "zh-CN", "es", "fr", "de"])("has track library and explorer labels in %s", (language) => {
  const dictionary = translations[language as LanguageCode];
  expect(dictionary["trackLibrary.title"].trim().length).toBeGreaterThan(0);
  expect(dictionary["lap.explorer.scope"].trim().length).toBeGreaterThan(0);
  expect(dictionary["lap.automaticTheoreticalBest"].trim().length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Add all seven locale dictionaries and responsive styles**

Localize visible UI only; retain canonical JSON/CSV keys and units. Add modal, profile list, explorer toolbar, matrix sticky first column, and mobile stacking. At widths below 680 px, modal actions and explorer navigation become single-column; tables scroll inside their wrappers without increasing document width.

- [ ] **Step 3: Update README and browser coverage**

Document automatic-vs-timing sectors, `analysisLine`, Track Library single/catalog imports, scoped Delta-T semantics, partial-lap rules, and client-side storage. Extend the existing browser test to open Track Library before loading a file, import/apply through UI fixtures, navigate an automatic scope, and assert no horizontal overflow on desktop and mobile.

- [ ] **Step 4: Run local verification and commit**

Run: `git diff --check && pnpm typecheck && pnpm lint && pnpm test && pnpm build`

Expected: typecheck/lint/build pass and all unit/component tests pass.

```bash
git add README.md src tests/analyzer.spec.ts
git commit -m "docs: finish automatic sector explorer"
```

### Task 8: Verify the supplied VTA, review, merge, and deploy

**Files:**
- Read only: `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`
- Verify: all changed source, tests, docs, GitHub workflow results, and deployed Pages UI

- [ ] **Step 1: Run a direct privacy-safe domain verification**

Use the existing Vite SSR loader to parse the supplied VTA without copying it into the repository. Print only counts and aggregate metrics:

```text
format
gpsPointCount
sensorPointCount
completeLapCount
partialLapCount
automaticSectionCount
cornerCount
straightCount
lapsWithSectionMetrics
scopedSampleCount
scopedDeltaStart
profileRoundTrip
catalogRoundTrip
```

Expected: seven complete laps remain detected with the validated gate, automatic sections contain at least one corner and straight, every complete lap has section metrics, scoped delta starts at zero, and both round trips succeed.

- [ ] **Step 2: Run complete verification and review**

Run: `git diff --check && pnpm typecheck && pnpm lint && pnpm test && pnpm build`

Expected: all commands pass. Review every explicit design requirement against code/tests and fix any uncovered gap before merging.

- [ ] **Step 3: Browser QA with Aside or the allowed in-app fallback**

Run the app at `127.0.0.1`, load the supplied VTA through the browser UI when file upload is supported, otherwise use the privacy-safe domain verification plus the built-in sample for interaction. Verify Track Library, automatic section creation, scope navigation, Speed/Delta-T zoom, matrix row navigation, section export, desktop/mobile overflow, and zero console errors.

- [ ] **Step 4: Merge and push**

```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff agent/automatic-sector-explorer -m "merge: automatic sector explorer"
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git push origin main
```

- [ ] **Step 5: Monitor and verify production**

Watch both CI and Deploy Pages for the pushed main SHA until successful. Open `https://woo4826.github.io/openvta-analyzer/`, repeat the Track Library and Lap Explorer smoke path, inspect mobile layout and console logs, then leave the deployed tab as deliverable.
