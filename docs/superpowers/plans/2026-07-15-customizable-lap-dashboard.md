# Customizable Lap Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, customizable lap-analysis dashboard with a top-bar file workspace, floating analysis controls, single-lap visibility, draggable/resizable widgets, and an accessible proportional section-range navigator.

**Architecture:** Keep parsing and loaded-file ownership in `App`, move only file presentation into a top-bar popover, and keep numerical analysis in `useSegmentWorkbench`. Add one validated local presentation-preferences module shared by a floating drawer and a responsive dashboard adapter. `react-grid-layout` owns desktop widget placement; `@radix-ui/react-slider` owns the two-thumb range interaction; both persist only non-sensitive UI state in localStorage.

**Tech Stack:** React 18, TypeScript, Vite, Vitest/Testing Library, ECharts, MapLibre GL, react-grid-layout 2.x, @radix-ui/react-slider, Aside browser QA, GitHub Actions/Pages.

---

### Task 1: Persisted dashboard preferences

**Files:**
- Create: `src/domain/segmentWorkbenchPreferences.ts`
- Modify: `src/domain/types.ts`
- Test: `src/domain/__tests__/segmentWorkbenchPreferences.test.ts`

- [ ] **Step 1: Write failing preference tests**

Cover defaults, round-trip localStorage, malformed JSON, unknown lap modes, unknown widget IDs, missing new widgets, invalid coordinates, and reset behavior. The expected default is `focus-reference`, all six widgets visible, drawer initially closed, section-boundary snapping enabled, and valid `lg`/`md` layouts.

- [ ] **Step 2: Run the focused test and observe failure**

Run: `pnpm vitest run src/domain/__tests__/segmentWorkbenchPreferences.test.ts`

Expected: FAIL because `segmentWorkbenchPreferences.ts` does not exist.

- [ ] **Step 3: Implement the validated preference boundary**

Define:

```ts
export type SegmentLapVisibility = "all" | "focus-reference" | "focus-only";
export type SegmentWidgetId = "opportunities" | "map" | "evidence" | "variation" | "telemetry" | "laps";
export interface SegmentWidgetLayout { i: SegmentWidgetId; x: number; y: number; w: number; h: number; minW?: number; minH?: number }
export interface SegmentWorkbenchPreferences {
  version: 1;
  drawerOpen: boolean;
  lapVisibility: SegmentLapVisibility;
  snapToSections: boolean;
  visibleWidgets: Record<SegmentWidgetId, boolean>;
  layouts: Record<string, SegmentWidgetLayout[]>;
}
```

Export `defaultSegmentWorkbenchPreferences`, `loadSegmentWorkbenchPreferences`, `saveSegmentWorkbenchPreferences`, `mergeSegmentLayouts`, and `canHideWidget`. Use key `openvta.segmentWorkbench.v1`; reject non-finite/non-integer geometry and clamp values to safe grid bounds.

- [ ] **Step 4: Run the focused tests**

Run: `pnpm vitest run src/domain/__tests__/segmentWorkbenchPreferences.test.ts`

Expected: PASS.

### Task 2: Top-bar file workspace

**Files:**
- Create: `src/components/TopbarFileWorkspace.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/i18n/locales.ts`
- Test: `src/app/__tests__/App.test.ts`
- Test: `tests/analyzer.spec.ts`

- [ ] **Step 1: Change component tests to require the top-bar workspace**

Assert that loaded files are reachable through a button named `Files`, selecting another file updates the active file, removal works inside the popover, and `.file-rail` is absent. Preserve the existing open-file action.

- [ ] **Step 2: Run the focused tests and observe failure**

Run: `pnpm vitest run src/app/__tests__/App.test.ts`

Expected: FAIL because the current file tray is in the left workspace column.

- [ ] **Step 3: Add `TopbarFileWorkspace`**

The component receives the same file collection and selection/removal callbacks as `FileTray`. Its trigger shows active filename plus file count. The popover renders format, GPS/enhanced/sensor/warning counts, active state, file switch buttons, removal buttons, and a nested import button. It closes on explicit close and after the last file is removed.

- [ ] **Step 4: Remove the file rail and simplify the workspace grid**

Render `TopbarFileWorkspace` in `.topbar-actions`. Remove `FileTray` and its `<aside>` from `App`; change the loaded workspace to a two-column analysis/inspector layout for non-lap tabs and one full-width analysis column for lap analysis.

- [ ] **Step 5: Run component tests**

Run: `pnpm vitest run src/app/__tests__/App.test.ts`

Expected: PASS.

### Task 3: Accessible proportional segment navigator

**Files:**
- Create: `src/components/SegmentRangeNavigator.tsx`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/app/useSegmentWorkbench.ts`
- Modify: `src/styles.css`
- Modify: `src/i18n/lapLocales.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `src/components/__tests__/SegmentRangeNavigator.test.tsx`
- Test: `src/app/__tests__/useSegmentWorkbench.test.tsx`

- [ ] **Step 1: Install the interaction primitive**

Run: `pnpm add @radix-ui/react-slider`

Expected: package and lockfile contain the Radix slider dependency.

- [ ] **Step 2: Write failing navigator tests**

Render a 1,000 m line with four unequal sections. Assert proportional section widths, named section selection, two thumbs labelled `Range start`/`Range end`, custom-range commit, nearest-boundary snapping, no-snap behavior, whole-lap reset, and corner/straight filtering.

- [ ] **Step 3: Run the focused test and observe failure**

Run: `pnpm vitest run src/components/__tests__/SegmentRangeNavigator.test.tsx`

Expected: FAIL because the navigator component does not exist.

- [ ] **Step 4: Implement `SegmentRangeNavigator`**

Use a controlled Radix `Slider.Root` with two `Slider.Thumb` elements. Render section buttons in an absolutely positioned proportional strip using `(start / total) * 100%` and `((end - start) / total) * 100%`. Keep transient thumb values locally; call `onRangeCommit` only from `onValueCommit`. Snap each committed edge with:

```ts
const boundary = boundaries.reduce((nearest, candidate) =>
  Math.abs(candidate - value) < Math.abs(nearest - value) ? candidate : nearest
);
return Math.abs(boundary - value) <= Math.max(8, totalDistance * 0.006) ? boundary : value;
```

Expose visible text for the selected scope and meters. Keep the existing `SegmentScopeRibbon` out of the rendered workbench once the navigator is integrated.

- [ ] **Step 5: Run navigator and hook tests**

Run: `pnpm vitest run src/components/__tests__/SegmentRangeNavigator.test.tsx src/app/__tests__/useSegmentWorkbench.test.tsx`

Expected: PASS.

### Task 4: Floating analysis controls and single-lap visibility

**Files:**
- Create: `src/components/SegmentWorkbenchControls.tsx`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/app/useSegmentWorkbench.ts`
- Modify: `src/components/SegmentTrajectoryMap.tsx`
- Modify: `src/components/SegmentLapTable.tsx`
- Modify: `src/styles.css`
- Modify: `src/i18n/lapLocales.ts`
- Test: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Test: `src/components/__tests__/SegmentLapTable.test.tsx`

- [ ] **Step 1: Add failing interaction tests**

Assert the floating trigger remains rendered, the drawer contains comparison/filter/axis/partial-lap/widget controls, `focus only` gives map/table only the focused lap, Delta-T still uses the reference, Escape/close dismisses the drawer, and the final visible widget cannot be hidden.

- [ ] **Step 2: Run the focused tests and observe failure**

Run: `pnpm vitest run src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/components/__tests__/SegmentLapTable.test.tsx`

Expected: FAIL because controls are still distributed across the header, ribbon, and records panel.

- [ ] **Step 3: Add visibility-aware workbench selectors**

Add `visibleLapIds` to `SegmentWorkbenchState`. For `all`, return all record IDs; for `focus-reference`, return focused/reference IDs; for `focus-only`, return only focused ID. Do not modify `referenceLapId` or the records used for calculation.

- [ ] **Step 4: Implement the floating drawer**

Move focused/reference selectors, lap visibility, section kind filter, axis, partial-lap policy, snap preference, widget switches, and layout reset into `SegmentWorkbenchControls`. Use a fixed drawer with a scrim below 680 px and a persistent fixed-edge trigger. Keep export/setup actions in a compact context toolbar.

- [ ] **Step 5: Filter presentation consumers only**

Pass `visibleLapIds` to map overlays and filter `SegmentLapTable` rows. Keep opportunity calculations and reference comparison untouched. Remove the rhetorical question headline and render the profile name plus selected scope in the context toolbar.

- [ ] **Step 6: Run focused tests**

Run: `pnpm vitest run src/components/__tests__/SegmentAnalysisWorkbench.test.tsx src/components/__tests__/SegmentLapTable.test.tsx`

Expected: PASS.

### Task 5: Draggable and resizable dashboard

**Files:**
- Create: `src/components/SegmentDashboard.tsx`
- Create: `src/components/DashboardWidget.tsx`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/styles.css`
- Modify: `src/i18n/lapLocales.ts`
- Modify: `src/main.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `src/components/__tests__/SegmentDashboard.test.tsx`
- Test: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`

- [ ] **Step 1: Install and inspect the grid library**

Run: `pnpm add react-grid-layout`

Expected: React 18-compatible 2.x package and lockfile entries are present. Import library styles from `react-grid-layout/css/styles.css` and `react-resizable/css/styles.css` if exposed by the installed package.

- [ ] **Step 2: Write failing dashboard tests**

Mock container width. Assert six named widgets, visibility removal, `onLayoutChange` persistence, reset to defaults, drag handle presence, interactive controls excluded from dragging, and no drag/resize mode under the mobile breakpoint.

- [ ] **Step 3: Implement the grid adapter**

Use `Responsive` and `useContainerWidth` from react-grid-layout. Supply stable `layouts`, breakpoints `{ lg: 1200, md: 900, sm: 680, xs: 0 }`, columns `{ lg: 12, md: 8, sm: 1, xs: 1 }`, a `.dashboard-widget-handle` drag handle, and `.dashboard-widget-content button,input,select,canvas,.map-shell` cancellation selectors. Call the preference save callback only on drag/resize stop or responsive layout change.

- [ ] **Step 4: Convert existing analysis blocks to widgets**

Create separate widgets for opportunities, map, evidence/coach, variation, telemetry, and lap table. Use a two-column default: map left and telemetry right, evidence under map and variation under telemetry, laps full-width. Hidden widgets stay unmounted. Trigger ECharts/MapLibre resize via their existing `ResizeObserver` behavior.

- [ ] **Step 5: Run dashboard tests**

Run: `pnpm vitest run src/components/__tests__/SegmentDashboard.test.tsx src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`

Expected: PASS.

### Task 6: Full regression and browser behavior

**Files:**
- Modify: `tests/analyzer.spec.ts`
- Modify: affected component snapshots/assertions under `src/**/__tests__`

- [ ] **Step 1: Update the browser test for the new information architecture**

Replace `.file-rail` assertions with top-bar file workspace assertions. For lap analysis, test the drawer, focus-only mode, section click, Radix range thumbs, opportunity visibility persistence, widget layout persistence after reload, and no horizontal overflow at desktop and mobile viewports.

- [ ] **Step 2: Run static and unit gates**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all commands exit 0; all unit tests pass.

- [ ] **Step 3: Run browser tests**

Run: `pnpm test:e2e`

Expected: all desktop and mobile projects pass.

### Task 7: Real-VTA QA, deployment, and production proof

**Files:**
- No sensitive VTA file is added to Git.
- Update implementation documentation only if runtime behavior differs from this plan.

- [ ] **Step 1: Start the app and verify with Aside**

Start `pnpm dev` at `127.0.0.1`. In Aside REPL, load `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`, open Lap Analysis, confirm Inje Speedium matching, isolate one lap, select a stored section, drag a custom range, hide biggest-loss ranking, move/resize map and telemetry widgets, reload, and confirm settings/layout persistence.

- [ ] **Step 2: Capture desktop and mobile screenshots**

Capture the open floating control drawer and the two-column widget board. Confirm no clipped controls, overlapping charts, inaccessible map, or horizontal overflow.

- [ ] **Step 3: Commit and push**

Run:

```bash
git diff --check
git status --short
git add package.json pnpm-lock.yaml src tests docs
git commit -m "feat: make lap analysis dashboard customizable"
git push origin main
```

Expected: clean worktree after commit and successful push.

- [ ] **Step 4: Verify GitHub Actions and Pages**

Wait for CI and Pages workflows for the pushed commit. Open the GitHub Pages URL with a build query, repeat the real-VTA smoke flow in Aside, and confirm the deployed commit serves the new dashboard.

