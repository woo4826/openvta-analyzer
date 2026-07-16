# Map Section Click Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every map section click resolve against the analysis distance frame, move the shared cursor to the clicked progress, and keep Workbench and Setup section selection synchronized before deploying to GitHub Pages.

**Architecture:** A pure `mapSectionSelection` module converts geographic clicks into absolute analysis-line distance and a section ID. `RouteMap` emits that metadata for MapLibre and SVG fallback clicks, `SegmentTrajectoryMap` converts it to the nearest focused-lap source point, and `LapAnalysis`/`SegmentAnalysisWorkbench` synchronize the explicit section ID across both views.

**Tech Stack:** React 18, TypeScript, MapLibre GL, GeoJSON, Vitest/Testing Library, Playwright, Aside, Vite, GitHub Actions/Pages

---

## File map

- Create `src/components/mapSectionSelection.ts`: pure coordinate projection, section resolution, midpoint fallback, and callback metadata.
- Create `src/components/__tests__/mapSectionSelection.test.ts`: coordinate-frame, parallel branch, boundary, gap, invalid, and empty input coverage.
- Modify `src/components/RouteMap.tsx`: emit projected section selections from MapLibre and midpoint selections from SVG fallback.
- Modify `src/components/__tests__/RouteMapSources.test.tsx`: capture layer handlers and prove rendered feature order is ignored.
- Modify `src/components/SegmentTrajectoryMap.tsx`: synchronize the map click with the focused-lap source point.
- Modify `src/components/__tests__/SegmentTrajectoryMap.test.tsx`: assert coordinate/distance to source-index selection.
- Modify `src/components/SegmentAnalysisWorkbench.tsx`: draw sections on `analysisLine` and synchronize explicit section selection.
- Modify `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`: assert the analysis line is passed and internal/external section state agrees.
- Modify `src/components/LapAnalysis.tsx`: connect the Setup section ID to the workbench.
- Modify `src/components/__tests__/LapAnalysis.test.tsx`: assert Workbench → Setup and Setup → Workbench selection round trips.
- Modify `tests/analyzer.spec.ts`: cover map/ribbon/setup synchronization without relying on raw MapLibre pixel coordinates for the synthetic fixture.
- Modify this plan with local, CI, Pages, and production verification evidence.

### Task 1: Build the pure click-to-section resolver

**Files:**
- Create: `src/components/mapSectionSelection.ts`
- Create: `src/components/__tests__/mapSectionSelection.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Create fixtures for a close out-and-back line and contiguous sections, then assert:

```ts
const line: LineString = {
  type: "LineString",
  coordinates: [[0, 0], [0.001, 0], [0.001, 0.0001], [0, 0.0001]],
};
const sections: TrackSection[] = [
  { id: "out", name: "Out", kind: "straight", startDistanceMeters: 0, endDistanceMeters: 111 },
  { id: "turn", name: "Turn", kind: "corner-right", startDistanceMeters: 111, endDistanceMeters: 122 },
  { id: "return", name: "Return", kind: "straight", startDistanceMeters: 122, endDistanceMeters: 233 },
];

expect(resolveMapSectionSelection([0.00075, 0.0001], line, sections)).toMatchObject({
  sectionId: "return",
  distanceMeters: expect.any(Number),
  coordinate: [0.00075, 0.0001],
});
expect(resolveSectionAtDistance(111, sections)?.id).toBe("turn");
expect(resolveSectionAtDistance(240, sections)?.id).toBe("return");
expect(sectionMidpointSelection(sections[0])).toEqual({ sectionId: "out", distanceMeters: 55.5 });
expect(resolveMapSectionSelection([Number.NaN, 0], line, sections)).toBeUndefined();
expect(resolveMapSectionSelection([0, 0], { type: "LineString", coordinates: [] }, sections)).toBeUndefined();
```

Add a gapped range case where the closer section wins and a boundary case where the section starting at the boundary wins.

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `corepack pnpm test -- src/components/__tests__/mapSectionSelection.test.ts`

Expected: FAIL because `mapSectionSelection.ts` does not exist.

- [ ] **Step 3: Implement the resolver**

Create:

```ts
import type { LineString, Position } from "geojson";
import { isCoordinate, projectCoordinateToLineProgress, routeDistanceMeters } from "../domain/geometry";
import type { TrackSection } from "../domain/types";

export interface MapSectionSelection {
  sectionId: string;
  distanceMeters: number;
  coordinate?: Position;
}

export function resolveMapSectionSelection(
  coordinate: Position,
  centerline: LineString,
  sections: TrackSection[],
): MapSectionSelection | undefined {
  if (!isCoordinate(coordinate) || centerline.coordinates.length < 2 || !sections.length) return undefined;
  const projection = projectCoordinateToLineProgress(coordinate, centerline);
  if (!Number.isFinite(projection.distanceMeters) || !Number.isFinite(projection.offsetMeters)) return undefined;
  const distanceMeters = Math.min(routeDistanceMeters(centerline.coordinates), Math.max(0, projection.distanceMeters));
  const section = resolveSectionAtDistance(distanceMeters, sections);
  return section ? { sectionId: section.id, distanceMeters, coordinate: [...coordinate] } : undefined;
}
```

Implement `resolveSectionAtDistance` so exact starts win, otherwise a containing half-open range wins, and finally the smallest distance-to-range error wins. Implement `sectionMidpointSelection` with the ordered average of start/end.

- [ ] **Step 4: Run the focused tests**

Run: `corepack pnpm test -- src/components/__tests__/mapSectionSelection.test.ts`

Expected: all resolver tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/mapSectionSelection.ts src/components/__tests__/mapSectionSelection.test.ts
git commit -m "fix: resolve map clicks in analysis distance frame"
```

### Task 2: Make RouteMap emit deterministic selection metadata

**Files:**
- Modify: `src/components/RouteMap.tsx`
- Modify: `src/components/__tests__/RouteMapSources.test.tsx`

- [ ] **Step 1: Extend the MapLibre test double and write a failing handler test**

Store layer handlers in the test double:

```ts
layerHandlers = new Map<string, (event: unknown) => void>();

on(event: string, layerOrHandler: string | (() => void), handler?: (event: unknown) => void) {
  if (event === "load" && typeof layerOrHandler === "function") queueMicrotask(layerOrHandler);
  if (typeof layerOrHandler === "string" && handler) this.layerHandlers.set(`${event}:${layerOrHandler}`, handler);
  return this;
}
```

Add a test that invokes `click:track-sections` with `features[0].properties.id = "wrong"` but a click coordinate on the second section. Assert `onSectionSelect` receives the coordinate-resolved ID and a finite distance:

```ts
map.layerHandlers.get("click:track-sections")?.({
  lngLat: { lng: 0.00075, lat: 0.0001 },
  features: [{ properties: { id: "wrong" } }],
});
expect(onSectionSelect).toHaveBeenCalledWith("return", expect.objectContaining({
  sectionId: "return",
  coordinate: [0.00075, 0.0001],
}));
```

Update the fallback test to expect midpoint metadata as the second callback argument.

- [ ] **Step 2: Run the RouteMap tests and confirm failure**

Run: `corepack pnpm test -- src/components/__tests__/RouteMapSources.test.tsx`

Expected: FAIL because the handler still emits `features[0]` and fallback emits only an ID.

- [ ] **Step 3: Update RouteMap callback and handler refs**

Change the prop to:

```ts
onSectionSelect?: (sectionId: string, selection?: MapSectionSelection) => void;
```

Keep the latest effective section centerline and sections in refs. In the MapLibre handler:

```ts
const coordinate: Position = [event.lngLat.lng, event.lngLat.lat];
const selection = resolveMapSectionSelection(
  coordinate,
  sectionCenterlineRef.current,
  trackSectionsRef.current,
);
if (selection) onSectionSelectRef.current?.(selection.sectionId, selection);
```

Do not read `event.features` for the selected ID. For fallback polylines, find the matching `TrackSection`, call `sectionMidpointSelection`, and emit both arguments for click and keyboard activation.

- [ ] **Step 4: Run RouteMap tests, typecheck, and lint the file**

Run:

```bash
corepack pnpm test -- src/components/__tests__/RouteMapSources.test.tsx
corepack pnpm typecheck
corepack pnpm exec eslint src/components/RouteMap.tsx src/components/__tests__/RouteMapSources.test.tsx --max-warnings=0
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/RouteMap.tsx src/components/__tests__/RouteMapSources.test.tsx
git commit -m "fix: select nearest rendered track section"
```

### Task 3: Synchronize a section click with the focused-lap cursor

**Files:**
- Modify: `src/components/SegmentTrajectoryMap.tsx`
- Modify: `src/components/__tests__/SegmentTrajectoryMap.test.tsx`

- [ ] **Step 1: Expose the mocked callback and write failing cursor tests**

Update the `RouteMap` mock to render controls that call:

```tsx
<button onClick={() => props.onSectionSelect?.("c1", {
  sectionId: "c1",
  distanceMeters: 80,
  coordinate: [128.0019, 38.00002],
})}>Select section by coordinate</button>
<button onClick={() => props.onSectionSelect?.("c1", {
  sectionId: "c1",
  distanceMeters: 75,
})}>Select fallback midpoint</button>
```

Assert the coordinate case selects the geographically nearest focused sample's source index and the fallback case subtracts `analysis.range.startDistanceMeters` before finding the nearest trajectory distance. Both cases must forward `"c1"` to the external section callback.

- [ ] **Step 2: Run the SegmentTrajectoryMap tests and confirm failure**

Run: `corepack pnpm test -- src/components/__tests__/SegmentTrajectoryMap.test.tsx`

Expected: FAIL because `SegmentTrajectoryMap` forwards the callback directly and does not move the cursor.

- [ ] **Step 3: Implement one section-selection wrapper**

Add:

```ts
const selectSectionFromMap = useCallback((sectionId: string, selection?: MapSectionSelection) => {
  const section = sections.find((candidate) => candidate.id === sectionId);
  const fallbackDistance = section
    ? sectionMidpointSelection(section).distanceMeters
    : analysis.range.startDistanceMeters;
  const sample = selection?.coordinate
    ? nearestCoordinateSample(focusedRecord?.trajectory ?? [], selection.coordinate)
    : nearestSample(
        focusedRecord,
        Math.max(0, (selection?.distanceMeters ?? fallbackDistance) - analysis.range.startDistanceMeters),
      );
  if (sample) onSelectedIndex(sample.sourceIndex);
  onSectionSelect(sectionId);
}, [analysis.range.startDistanceMeters, focusedRecord, onSectionSelect, onSelectedIndex, sections]);
```

Use `pointToLine`-style haversine distance for coordinate comparison and pass the wrapper to `RouteMap`. Preserve direct route-point selection.

- [ ] **Step 4: Run focused tests and lint**

Run:

```bash
corepack pnpm test -- src/components/__tests__/SegmentTrajectoryMap.test.tsx
corepack pnpm exec eslint src/components/SegmentTrajectoryMap.tsx src/components/__tests__/SegmentTrajectoryMap.test.tsx --max-warnings=0
```

Expected: all tests pass and lint reports zero warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/SegmentTrajectoryMap.tsx src/components/__tests__/SegmentTrajectoryMap.test.tsx
git commit -m "fix: synchronize map section and cursor"
```

### Task 4: Unify Workbench and Setup explicit section selection

**Files:**
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/LapAnalysis.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Modify: `src/components/__tests__/LapAnalysis.test.tsx`

- [ ] **Step 1: Write failing Workbench coordinate-frame and state tests**

Extend the `SegmentTrajectoryMap` mock to expose its `centerline` coordinates and a section-selection button. Render with different `profile.centerline` and `analysisLine`, then assert the mock receives `analysisLine`.

Pass `selectedSectionId="s1"` after the initial render and assert the ribbon/chooser switches to Straight 1. Click the mocked map section for `c1` and assert both the ribbon and `onSelectedSectionId("c1")` update. Also assert that the initial Setup fallback does not replace the Workbench's whole-lap default and that selecting Whole Lap is not immediately undone.

- [ ] **Step 2: Extend the LapAnalysis round-trip test**

After selecting `straight-neutral` in Workbench, open Setup and assert the `Section to edit` select has `straight-neutral`. Change it to `corner-2`, return to Workbench, and assert the Corner 2 ribbon button has `aria-pressed="true"`.

- [ ] **Step 3: Run both test files and confirm failure**

Run:

```bash
corepack pnpm test -- src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/components/__tests__/LapAnalysis.test.tsx
```

Expected: FAIL because Workbench still uses `profile.centerline` and has no shared selected-section props.

- [ ] **Step 4: Add controlled selection synchronization**

Add optional props:

```ts
selectedSectionId?: string;
onSelectedSectionId?: (sectionId: string) => void;
```

Create one wrapper:

```ts
const selectSection = useCallback((sectionId: string) => {
  workbench.selectSection(sectionId);
  onSelectedSectionId?.(sectionId);
}, [onSelectedSectionId, workbench.selectSection]);
```

Use it for `SegmentScopeNavigator` and `SegmentTrajectoryMap`. Add an effect that applies a valid externally selected section when it differs from `workbench.scope.sectionId`. Pass `analysisLine`, not `profile.centerline`, to `SegmentTrajectoryMap`.

Gate the external effect by an ID-change ref so an unchanged Setup selection cannot force the Workbench out of Whole Lap or Custom Range:

```ts
const lastExternalSectionIdRef = useRef(selectedSectionId);

useEffect(() => {
  if (selectedSectionId === lastExternalSectionIdRef.current) return;
  lastExternalSectionIdRef.current = selectedSectionId;
  if (!selectedSectionId || !profile.sections.some((section) => section.id === selectedSectionId)) return;
  if (workbench.scope.kind === "section" && workbench.scope.sectionId === selectedSectionId) return;
  workbench.selectSection(selectedSectionId);
}, [profile.sections, selectedSectionId, workbench.scope, workbench.selectSection]);
```

In `LapAnalysis`, pass `selectedSectionId` and `setSelectedSectionId` into the workbench. Keep Setup dropdown and Setup map on the same setter. Do not initialize `selectedSectionId` merely because a profile has a first section; the Setup editor can visually fall back to the first section while the ID remains undefined until the user explicitly selects a section. Only repair an already-defined ID when it becomes invalid.

- [ ] **Step 5: Run component tests, typecheck, and lint**

Run:

```bash
corepack pnpm test -- src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/components/__tests__/LapAnalysis.test.tsx
corepack pnpm typecheck
corepack pnpm lint
```

Expected: all tests pass with zero type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/SegmentAnalysisWorkbench.tsx src/components/LapAnalysis.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/components/__tests__/LapAnalysis.test.tsx
git commit -m "fix: keep selected track section synchronized"
```

### Task 5: Browser regression, supplied VTA verification, and hardening

**Files:**
- Modify: `tests/analyzer.spec.ts`
- Modify as needed only for confirmed regressions in the files above
- Modify: `docs/superpowers/plans/2026-07-16-map-section-click-synchronization.md`

- [ ] **Step 1: Add a browser state round-trip regression**

In the main analysis E2E flow, select a section through the existing scope control, open Setup, verify the `Section to edit` value, change it, return to Workbench, and verify the ribbon/chooser/header all report the new section. Preserve the existing Speed/Delta cursor and drag-zoom checks.

- [ ] **Step 2: Run the complete local gate**

Run:

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
git diff --check
```

Expected: zero type/lint/whitespace errors, all Vitest tests pass, production build succeeds, and all Playwright desktop/mobile tests pass.

- [ ] **Step 3: Verify the supplied VTA with Aside**

Open the local app, import `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`, and confirm 1,589 GPS fixes, 158,289 sensor rows, and Inje Speedium match.

On the whole-lap map, click at least four separated sections, including close branches. For each click record the chosen section ID/range, cursor readout, and selected map marker. Confirm the clicked physical line, selected scope, and cursor agree. Switch to Setup and verify the same section is selected; choose another Setup section and verify Workbench updates on return. Repeat one representative flow at mobile width and capture console/page errors.

- [ ] **Step 4: Review the complete diff and commit verification changes**

Inspect `git diff f4b25fe..HEAD` for callback compatibility, long-lived MapLibre refs, coordinate-frame consistency, scope-relative cursor conversion, SVG keyboard behavior, state loops, and test coverage. Fix every confirmed issue, rerun its focused test, then rerun the complete gate.

Record exact local evidence in this plan and commit:

```bash
git add tests/analyzer.spec.ts docs/superpowers/plans/2026-07-16-map-section-click-synchronization.md
git commit -m "test: verify map section click synchronization"
```

### Task 6: Deploy and prove production behavior

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-map-section-click-synchronization.md`

- [ ] **Step 1: Push main**

Run:

```bash
git status --short --branch
git push origin main
```

Expected: clean `main` advances on `origin/main`.

- [ ] **Step 2: Monitor CI and Pages**

Run `gh run list --commit <sha>` and `gh run watch <run-id> --exit-status` for CI and Deploy Pages.

Expected: both workflows finish successfully for the pushed SHA.

- [ ] **Step 3: Smoke-test production with Aside**

Open `https://woo4826.github.io/openvta-analyzer/?v=<sha>`, import the supplied VTA, and repeat the whole-lap close-branch click, cursor synchronization, Workbench/Setup round trip, mobile representative flow, and console/page error check.

Expected: production reproduces local behavior with zero selection mismatch and zero browser errors.

- [ ] **Step 4: Record deployment evidence and finalize documentation**

Add final SHA, CI/Pages run IDs, deployed URL, clicked sections/ranges, cursor results, state round-trip result, and browser error count to this plan. Commit and push the documentation update, monitor the final workflows, and verify the worktree is clean.
