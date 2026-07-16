# Unified Segment Scope and Drag Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate Lap Analysis range controls with one dynamic, length-proportional scope navigator and restore synchronized drag-to-zoom across all telemetry charts.

**Architecture:** `SegmentScopeNavigator` becomes the only scope presentation and emits whole-lap, stored-section, and custom-range actions into `useSegmentWorkbench`. `SegmentTelemetryChart` owns a normalized shared zoom window; each `ChartPanel` emits a brushed domain range that is converted against the common telemetry domain and applied to every metric chart.

**Tech Stack:** React 19, TypeScript, Radix Slider, Apache ECharts, Vitest/Testing Library, Vite, Aside browser QA, GitHub Actions/Pages

---

### Task 1: Lock the unified navigator contract with tests

**Files:**
- Create: `src/components/SegmentScopeNavigator.tsx`
- Create: `src/components/__tests__/SegmentScopeNavigator.test.tsx`
- Modify: `src/app/__tests__/useSegmentWorkbench.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add a controlled harness that starts at whole lap on a 4028 m track, selects a
stored section from both the proportional strip and select, commits a custom
range through the two Radix thumbs, resets to whole lap, and asserts that the
summary text and slider values always reflect the same controlled scope.

- [ ] **Step 2: Run the navigator test and confirm failure**

Run: `pnpm test src/components/__tests__/SegmentScopeNavigator.test.tsx`

Expected: FAIL because `SegmentScopeNavigator` does not exist.

- [ ] **Step 3: Add a missing-section hook regression**

Extend the existing hook test to prove selection remains valid for generated
profiles with no sections and that custom ranges clamp through domain analysis
without introducing a stored section.

- [ ] **Step 4: Run hook tests**

Run: `pnpm test src/app/__tests__/useSegmentWorkbench.test.tsx`

Expected: PASS for existing contracts and FAIL only if the new edge case exposes
a real scope-state defect.

### Task 2: Implement and integrate the single scope navigator

**Files:**
- Create: `src/components/SegmentScopeNavigator.tsx`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/SegmentWorkbenchControls.tsx`
- Delete: `src/components/SegmentScopeRibbon.tsx`
- Delete: `src/components/SegmentRangeNavigator.tsx`
- Delete: `src/components/__tests__/SegmentScopeRibbon.test.tsx`
- Delete: `src/components/__tests__/SegmentRangeNavigator.test.tsx`
- Modify: `src/styles.css`
- Modify: `src/i18n/lapLocales.ts`

- [ ] **Step 1: Build the controlled navigator**

Implement props for `scope`, `filter`, `sections`, `totalDistanceMeters`,
`snapToSections`, `onFilter`, `onWholeLap`, `onSection`, and `onRange`. Derive
the committed range from the controlled scope and keep only the transient slider
draft locally. Render exact proportional section buttons, a precise select,
range thumbs, current scope summary, and whole-lap action.

- [ ] **Step 2: Replace both old presentations**

Render the new navigator in the sticky workbench stack. Remove
`SegmentRangeNavigator` and its range props from the Analysis controls drawer.
Keep lap visibility, graph axis, range snapping, partial-lap policy, widget
visibility, and layout reset in the drawer.

- [ ] **Step 3: Consolidate navigation controls**

Move previous/next section actions into the navigator and remove the duplicate
comparison-bar arrows. Ensure filters never leave an incompatible selected
section active.

- [ ] **Step 4: Add responsive and focus styles**

Use an overflow-safe proportional strip, visible selected/focus states, compact
labels only when space allows, and a precise select fallback for short sections.
Keep the range thumbs keyboard-operable and preserve the sticky-stack behavior.

- [ ] **Step 5: Run focused scope tests**

Run: `pnpm test src/components/__tests__/SegmentScopeNavigator.test.tsx src/app/__tests__/useSegmentWorkbench.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the unified scope UI**

```bash
git add src/components src/app/__tests__/useSegmentWorkbench.test.tsx src/styles.css src/i18n/lapLocales.ts
git commit -m "feat: unify lap analysis scope controls"
```

### Task 3: Restore shared drag-to-zoom

**Files:**
- Modify: `src/components/ChartPanel.tsx`
- Modify: `src/components/chartInteraction.ts`
- Modify: `src/components/SegmentTelemetryChart.tsx`
- Modify: `src/components/segmentTelemetryOptions.ts`
- Modify: `src/components/__tests__/ChartPanel.test.ts`
- Modify: `src/components/__tests__/ChartPanelComponent.test.tsx`
- Modify: `src/components/__tests__/SegmentTelemetryChart.test.tsx`
- Modify: `src/i18n/lapLocales.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing brush-to-zoom tests**

Capture every mocked `ChartPanel` `onBrushRange` callback. Trigger a distance
range from Speed and a time range from Delta-T, then assert all three options
receive the same normalized data-zoom start/end. Assert a too-small or invalid
range does not alter zoom.

- [ ] **Step 2: Write the reset-action test**

After a brush zoom, assert the toolbar exposes `Show all`, invokes a full-window
reset, removes itself when the window reaches 0–100, and keeps the shared cursor
unchanged.

- [ ] **Step 3: Implement domain normalization**

Export one pure common-domain calculation from `segmentTelemetryOptions.ts` and
one pure domain-range-to-window helper. Clamp inputs, order reversed drags, and
reject selections smaller than the useful domain threshold.

- [ ] **Step 4: Enable and clear horizontal brushes**

Pass `interactionMode="range"` and `onBrushRange` to all three panels. Clear the
finished brush after emitting its range so consecutive drags work. Avoid a
dataZoom feedback loop by retaining equality checks in the controlled window.

- [ ] **Step 5: Add zoom help and reset UI**

Add localized drag guidance and a conditional `Show all` action in the shared
telemetry toolbar. Keep wheel, pinch, slider, hover, click, keyboard, and map
cursor synchronization intact.

- [ ] **Step 6: Run focused telemetry tests**

Run: `pnpm test src/components/__tests__/ChartPanel.test.ts src/components/__tests__/ChartPanelComponent.test.tsx src/components/__tests__/SegmentTelemetryChart.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit drag zoom**

```bash
git add src/components src/i18n/lapLocales.ts src/styles.css
git commit -m "fix: restore synchronized telemetry drag zoom"
```

### Task 4: Review and repair adjacent Lap Analysis regressions

**Files:**
- Inspect/modify as required: `src/components/SegmentAnalysisWorkbench.tsx`
- Inspect/modify as required: `src/components/SegmentTrajectoryMap.tsx`
- Inspect/modify as required: `src/components/SegmentDashboard.tsx`
- Inspect/modify as required: `src/app/useSegmentWorkbench.ts`
- Test: matching files under `src/components/__tests__/` and `src/app/__tests__/`

- [ ] **Step 1: Trace all interaction ownership paths**

Review scope, focus/reference roles, cursor, zoom, map segment, filter, drawer,
and recording-change state for duplicated sources, stale closures, uncontrolled
resets, missing bounds, and event feedback loops.

- [ ] **Step 2: Add one failing regression test per confirmed defect**

Do not change speculative code. For each reproducible defect, add the smallest
test that demonstrates the incorrect state transition or rendered output.

- [ ] **Step 3: Apply minimal repairs and rerun focused tests**

Run the owning test file after every repair. Preserve zero-backend behavior,
export contracts, local profile storage, and focused/reference semantics.

- [ ] **Step 4: Commit confirmed adjacent repairs**

```bash
git add src
git commit -m "fix: harden lap analysis interactions"
```

Skip the commit if the review finds no additional confirmed defect.

### Task 5: Verify with the supplied VTA and deploy

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-unified-segment-scope-and-drag-zoom.md`

- [ ] **Step 1: Run repository verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`

Expected: all commands exit 0.

- [ ] **Step 2: Run Aside browser QA with the real recording**

Load `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`. Verify whole lap,
Corner 6, Straight 12, and a custom slider range update the one navigator,
workbench calculations, map highlight, and telemetry domain. Drag across each
chart and confirm all canvases zoom together; use `전체 보기` and confirm all
return to the full domain. Confirm no console errors and no horizontal overflow
at desktop and narrow widths.

- [ ] **Step 3: Record evidence in this plan**

Append exact test totals, parsed GPS/sensor counts, selected ranges, drag-zoom
windows, responsive viewport results, commit hash, workflow URLs, and deployed
URL.

- [ ] **Step 4: Commit documentation and push main**

```bash
git add docs/superpowers/plans/2026-07-16-unified-segment-scope-and-drag-zoom.md
git commit -m "docs: record unified scope verification"
git push origin main
```

- [ ] **Step 5: Confirm GitHub Pages deployment**

Wait for the pushed commit's CI and Pages workflows to succeed, open the
deployed application with a cache-busting query parameter, repeat the critical
section-selection and drag-zoom smoke path, and report the workflow and app
links.

