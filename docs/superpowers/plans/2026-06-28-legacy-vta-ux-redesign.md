# Legacy VTA UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the useful legacy VTA_Road analysis workflows missing from OpenVTA Analyzer and replace the current template-like interface with a compact engineering analysis design system.

**Architecture:** Keep raw parsed VTA data immutable, add app-level analysis state for selected file, selected point, selected segment, source toggles, transforms, map settings, and chart settings. Build reusable UI primitives first, then refactor workspace, map, charts, tables, calibration, and export around those primitives.

**Tech Stack:** React 18, TypeScript, Vite, MapLibre GL JS, Apache ECharts, JSZip, Vitest, Playwright, GitHub Pages.

---

## File Structure

- Create `src/domain/analysis.ts`: source filtering, segment normalization, segment summaries, distance-over-time rows, velocity-derived acceleration validation rows, and region summaries.
- Create `src/domain/settings.ts`: recoverable local storage helpers for map settings, chart settings, transform settings, and calibration presets.
- Modify `src/domain/types.ts`: add workspace file identity, analysis state, segment, source toggles, map/chart settings, transform mode, validation rows, and calibration presets.
- Modify `src/domain/export.ts`: add line-ending control, visible-row CSV export helpers, validation CSV, and transformed segment export headers.
- Create `src/components/ui.tsx`: reusable design-system primitives.
- Replace `src/styles.css`: tokenized analysis UI with compact shell, toolbars, panels, tables, tabs, badges, fields, and responsive rules.
- Modify `src/app/App.tsx`: workspace state orchestration, file tray, active transforms, segment state, settings persistence, and new layout.
- Modify `src/components/Overview.tsx`: analysis dashboard using map, summaries, selected point, segment, warnings, and workspace status.
- Modify `src/components/RouteMap.tsx`: source toggles, point-size/speed-threshold settings, segment highlighting, map-driven segment controls, and region summary hooks.
- Modify `src/components/Charts.tsx`: linked hover/click, brush segment selection, average panels, distance chart, validation chart, and transform mode labels.
- Modify `src/components/Tables.tsx`: sortable tabs for GPS, enhanced, sensors, warnings, summary, and validation; visible CSV export.
- Modify `src/components/CalibrationPanel.tsx`: static window controls, preset save/load/delete/import/export, transform mode preview.
- Modify `src/components/ExportPanel.tsx`: app-level segment state, richer preview, line-ending setting, validation export, transformed export.
- Modify `tests/analyzer.spec.ts`: E2E coverage for the redesigned workflow.
- Create/extend domain tests under `src/domain/__tests__/`.
- Update `README.md`: document feature parity, limitations, and user workflow.

---

### Task 1: Domain Analysis State, Segment Summary, Validation, And Settings

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/analysis.ts`
- Create: `src/domain/settings.ts`
- Modify: `src/domain/export.ts`
- Test: `src/domain/__tests__/analysis.test.ts`
- Test: `src/domain/__tests__/settings.test.ts`
- Test: `src/domain/__tests__/parser.test.ts`

- [ ] **Step 1: Write failing analysis tests**

Add tests that prove:

```ts
import { describe, expect, it } from "vitest";
import { parseVtaText } from "../parser";
import {
  buildValidationRows,
  displayGpsPointsWithSources,
  normalizeSegment,
  routeDistanceSeries,
  summarizeSegment,
} from "../analysis";

describe("analysis helpers", () => {
  const trace = parseVtaText(
    "analysis.Vta",
    [
      "$17062026,152220,-33.875000000,151.225000000,10,0,0,8",
      "$17062026,152221,-33.874900000,151.225100000,11,36,0,8",
      "@17062026,152221,-33.874880000,151.225120000,11,38,0,8,4.2,gps,1,ImuHeading,0.9,preset,1",
      "$17062026,152222,-33.874800000,151.225200000,12,72,0,8",
      "#0,0.000,0,0,0,0,0.1,0.2,9.7",
      "#1,1.000,0,0,0,0,0.2,0.3,9.8",
      "#2,2.000,0,0,0,0,0.3,0.4,9.9",
    ].join("\n"),
  );

  it("filters raw and enhanced sources independently", () => {
    expect(displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false })).toHaveLength(3);
    expect(displayGpsPointsWithSources(trace, { rawGps: false, enhancedGps: true })).toHaveLength(1);
  });

  it("normalizes reversed segment indexes and summarizes selected rows", () => {
    const segment = normalizeSegment({ startIndex: 2, endIndex: 0, source: "manual" }, 3);
    const summary = summarizeSegment(trace, trace.sensorPoints, segment, { rawGps: true, enhancedGps: false });
    expect(segment).toEqual({ startIndex: 0, endIndex: 2, source: "manual" });
    expect(summary.pointCount).toBe(3);
    expect(summary.sensorCount).toBe(3);
    expect(summary.maxSpeedKmh).toBe(72);
    expect(summary.distanceKm).toBeGreaterThan(0);
  });

  it("builds distance and velocity-derived acceleration rows", () => {
    expect(routeDistanceSeries(displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false }))[2].distanceKm).toBeGreaterThan(0);
    const validation = buildValidationRows(displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false }));
    expect(validation).toHaveLength(2);
    expect(validation[1].derivedAccelMps2).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Write failing settings tests**

Add tests that prove invalid local-storage JSON is ignored and calibration presets round-trip:

```ts
import { describe, expect, it, vi } from "vitest";
import { loadJsonSetting, saveJsonSetting, upsertCalibrationPreset } from "../settings";
import type { CalibrationPreset } from "../types";

describe("settings helpers", () => {
  it("falls back when local storage contains invalid JSON", () => {
    const store = new Map<string, string>([["broken", "{"]]);
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: vi.fn(), removeItem: vi.fn() };
    expect(loadJsonSetting("broken", { ok: true }, storage)).toEqual({ ok: true });
  });

  it("saves and upserts calibration presets", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: vi.fn(),
    };
    const preset: CalibrationPreset = {
      id: "preset-1",
      name: "Static pad",
      createdAt: 1700000000000,
      offsets: { x: 0.1, y: -0.2, z: 0.3, unit: "mps2", sampleCount: 30 },
    };
    const presets = upsertCalibrationPreset([], preset);
    saveJsonSetting("presets", presets, storage);
    expect(loadJsonSetting<CalibrationPreset[]>("presets", [], storage)[0].name).toBe("Static pad");
  });
});
```

- [ ] **Step 3: Implement types and helpers**

Add concrete interfaces in `src/domain/types.ts`:

```ts
export interface VtaWorkspaceFile extends VtaFile {
  id: string;
  loadedAt: number;
}

export interface SourceVisibility {
  rawGps: boolean;
  enhancedGps: boolean;
}

export interface ActiveSegment {
  startIndex: number;
  endIndex: number;
  source: "manual" | "map" | "chart";
}

export interface SegmentSummary {
  pointCount: number;
  sensorCount: number;
  durationSeconds: number;
  distanceKm: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  minAltitudeMeters?: number;
  maxAltitudeMeters?: number;
  warningCount: number;
}

export interface ValidationRow {
  index: number;
  elapsedSeconds: number;
  speedKmh: number;
  deltaSpeedKmh: number;
  derivedAccelMps2: number;
}

export interface CalibrationPreset {
  id: string;
  name: string;
  createdAt: number;
  offsets: CalibrationOffsets;
}

export interface MapSettings {
  pointSize: number;
  tileUrl: string;
  speedThresholds: [number, number, number, number];
}

export interface ChartSettings {
  showRaw: boolean;
  showTransformed: boolean;
}

export type TransformMode = "raw" | "calibrated" | "filtered" | "compare";
```

Implement helpers in `src/domain/analysis.ts`; use existing `routeDistanceKm()` and `displayGpsPoints()` patterns, and do not mutate raw arrays.

- [ ] **Step 4: Extend export helpers**

Add:

```ts
export type LineEnding = "lf" | "crlf";
export function withLineEndings(text: string, lineEnding: LineEnding): string;
export function validationCsv(rows: ValidationRow[], lineEnding?: LineEnding): string;
export function genericCsv(headers: string[], rows: Array<Array<string | number>>, lineEnding?: LineEnding): string;
```

Keep existing `gpsCsv`, `sensorCsv`, and `exportSegmentVta` working.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
pnpm test -- src/domain/__tests__/analysis.test.ts src/domain/__tests__/settings.test.ts src/domain/__tests__/parser.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain src/domain/__tests__
git commit -m "Add analysis state and validation helpers"
```

---

### Task 2: Design System Primitives And Tokenized CSS

**Files:**
- Create: `src/components/ui.tsx`
- Replace/modify: `src/styles.css`
- Modify: `src/test/setup.ts` only if tests need DOM helpers
- Test: `src/components/__tests__/ui.test.tsx`

- [ ] **Step 1: Write failing UI primitive tests**

Create tests for `Panel`, `Metric`, `StatusBadge`, `Tabs`, `SegmentedControl`, and `Field`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Metric, Panel, SegmentedControl, StatusBadge, Tabs } from "../ui";

describe("ui primitives", () => {
  it("renders analysis panels and metrics", () => {
    render(<Panel title="Summary"><Metric label="Max speed" value="72 km/h" /></Panel>);
    expect(screen.getByRole("heading", { name: "Summary" })).toBeVisible();
    expect(screen.getByText("72 km/h")).toBeVisible();
  });

  it("changes segmented control value", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl ariaLabel="Mode" value="raw" options={[{ value: "raw", label: "Raw" }, { value: "compare", label: "Compare" }]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(onChange).toHaveBeenCalledWith("compare");
  });

  it("supports tab selection and badges", async () => {
    const onChange = vi.fn();
    render(<><StatusBadge tone="warning">2 warnings</StatusBadge><Tabs ariaLabel="Sections" activeKey="map" items={[{ key: "map", label: "Map" }, { key: "tables", label: "Tables" }]} onChange={onChange} /></>);
    expect(screen.getByText("2 warnings")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Tables" }));
    expect(onChange).toHaveBeenCalledWith("tables");
  });
});
```

- [ ] **Step 2: Implement UI primitives**

Create strongly typed primitives:

```tsx
export function Panel({ title, eyebrow, actions, children, className }: PanelProps) { ... }
export function Metric({ label, value, detail, tone }: MetricProps) { ... }
export function StatusBadge({ tone, children }: StatusBadgeProps) { ... }
export function ToolbarButton({ icon, children, ...buttonProps }: ToolbarButtonProps) { ... }
export function IconButton({ label, icon, ...buttonProps }: IconButtonProps) { ... }
export function Tabs<T extends string>({ items, activeKey, onChange, ariaLabel }: TabsProps<T>) { ... }
export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel }: SegmentedControlProps<T>) { ... }
export function Field({ label, children, hint }: FieldProps) { ... }
export function EmptyState({ title, children, action }: EmptyStateProps) { ... }
export function WarningBanner({ children }: { children: React.ReactNode }) { ... }
```

Use `lucide-react` icons through props; do not hard-code one-off SVGs.

- [ ] **Step 3: Replace CSS with tokenized analysis shell**

Define CSS variables under `:root`, including:

```css
--color-bg: #eef2f4;
--color-shell: #142231;
--color-surface: #ffffff;
--color-panel: #fbfcfd;
--color-border: #c7d2d9;
--color-text: #15202b;
--color-muted: #5c6f7a;
--color-accent: #16796f;
--color-warning: #b76b00;
--color-danger: #c43131;
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
```

Add classes for `.app-shell`, `.topbar`, `.workspace-grid`, `.file-rail`, `.analysis-main`, `.analysis-inspector`, `.panel`, `.toolbar`, `.segmented`, `.tabs`, `.metric`, `.status-badge`, `.data-table`, `.map-shell`, `.chart`, responsive breakpoints, and print styles.

- [ ] **Step 4: Run UI tests**

Run:

```bash
pnpm test -- src/components/__tests__/ui.test.tsx
pnpm lint
```

Expected: tests and lint pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui.tsx src/components/__tests__/ui.test.tsx src/styles.css
git commit -m "Add analysis design system primitives"
```

---

### Task 3: App Workspace, File Tray, Source Toggles, Transform Mode, And Segment State

**Files:**
- Modify: `src/app/App.tsx`
- Create: `src/components/FileTray.tsx`
- Create: `src/components/WorkspaceStatus.tsx`
- Modify: `src/components/FileDrop.tsx`
- Modify: `src/components/Overview.tsx`
- Test: `tests/analyzer.spec.ts`

- [ ] **Step 1: Extend E2E expectations for workspace shell**

Add assertions after loading sample:

```ts
await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
await expect(page.getByText("GPS 37")).toBeVisible();
await expect(page.getByText("Enhanced 35")).toBeVisible();
await expect(page.getByRole("button", { name: "Raw GPS" })).toHaveAttribute("aria-pressed", "true");
await expect(page.getByRole("button", { name: "Enhanced" })).toHaveAttribute("aria-pressed", "true");
await expect(page.getByRole("button", { name: "Compare" })).toBeVisible();
```

- [ ] **Step 2: Implement workspace state**

In `App.tsx`, convert loaded files to `VtaWorkspaceFile[]`:

```ts
const parsed = loaded.map((file, index) => ({
  ...parseVtaText(file.name, file.text),
  id: `${file.name}-${Date.now()}-${index}`,
  loadedAt: Date.now(),
}));
```

Add state:

```ts
const [sourceVisibility, setSourceVisibility] = useState<SourceVisibility>({ rawGps: true, enhancedGps: true });
const [activeSegment, setActiveSegment] = useState<ActiveSegment | undefined>();
const [transformMode, setTransformMode] = useState<TransformMode>("raw");
```

Use `displayGpsPointsWithSources()` everywhere instead of raw `displayGpsPoints()`.

- [ ] **Step 3: Add file tray**

`FileTray` must show loaded files, warning counts, row counts, active state, remove button, and a sample action. Removing active file should select the next available file or return to drop zone.

- [ ] **Step 4: Add source toggles and transform segmented control**

Use `SegmentedControl` and `ToolbarButton` primitives. Disabling both GPS sources is not allowed; clicking the last active source should leave it active.

- [ ] **Step 5: Run E2E subset**

Run:

```bash
pnpm test:e2e -- --project=chromium
```

Expected: redesigned sample workflow passes.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/components/FileTray.tsx src/components/WorkspaceStatus.tsx src/components/FileDrop.tsx src/components/Overview.tsx tests/analyzer.spec.ts
git commit -m "Add analyzer workspace shell"
```

---

### Task 4: Map Analysis Controls, Segment Highlighting, And Region Summary

**Files:**
- Modify: `src/components/RouteMap.tsx`
- Create: `src/components/MapControls.tsx`
- Modify: `src/components/Overview.tsx`
- Modify: `src/domain/analysis.ts`
- Test: `src/domain/__tests__/analysis.test.ts`
- Test: `tests/analyzer.spec.ts`

- [ ] **Step 1: Add domain tests for rectangular region summary**

Add:

```ts
import { summarizeAxisAlignedRegion } from "../analysis";

it("summarizes points inside an axis-aligned map region", () => {
  const points = displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false });
  const summary = summarizeAxisAlignedRegion(points, {
    minLatitude: -33.8751,
    maxLatitude: -33.87475,
    minLongitude: 151.2249,
    maxLongitude: 151.22525,
  });
  expect(summary.pointCount).toBe(3);
  expect(summary.maxSpeedKmh).toBe(72);
});
```

- [ ] **Step 2: Extend RouteMap props**

Add props:

```ts
sourceVisibility: SourceVisibility;
settings: MapSettings;
segment?: ActiveSegment;
region?: AxisAlignedRegion;
onSegmentChange: (segment?: ActiveSegment) => void;
onRegionChange: (region?: AxisAlignedRegion) => void;
onSettingsChange: (settings: MapSettings) => void;
```

- [ ] **Step 3: Add route layers**

MapLibre layers must include:

- route line halo
- route line
- segment line halo
- segment line
- route points with configurable radius
- selected point marker
- optional region rectangle fill/outline

Coordinate fallback must draw the same route, segment, points, and region.

- [ ] **Step 4: Add controls**

Controls:

- Fit route
- Select start from current point
- Select end from current point
- Clear segment
- Region from visible route bounds
- Point size input or stepper

Use icon buttons with labels/tooltips.

- [ ] **Step 5: E2E check**

Add Playwright steps:

```ts
await page.getByRole("button", { name: "Set segment start" }).click();
await page.getByRole("button", { name: "Set segment end" }).click();
await expect(page.getByText("Segment")).toBeVisible();
await page.getByRole("button", { name: "Create region" }).click();
await expect(page.getByText("Region points")).toBeVisible();
```

- [ ] **Step 6: Commit**

```bash
git add src/components/RouteMap.tsx src/components/MapControls.tsx src/components/Overview.tsx src/domain/analysis.ts src/domain/__tests__/analysis.test.ts tests/analyzer.spec.ts
git commit -m "Add map segment and region analysis controls"
```

---

### Task 5: Linked Charts, Brush Segment Selection, Distance Chart, And Validation Chart

**Files:**
- Modify: `src/components/Charts.tsx`
- Create: `src/components/ChartPanel.tsx`
- Modify: `src/domain/analysis.ts`
- Test: `tests/analyzer.spec.ts`

- [ ] **Step 1: Split chart panel**

Move reusable ECharts lifecycle into `ChartPanel.tsx`, accepting:

```ts
interface ChartPanelProps {
  title: string;
  option: EChartsOption;
  className?: string;
  onPoint?: (index: number) => void;
  onBrushSegment?: (startIndex: number, endIndex: number) => void;
}
```

- [ ] **Step 2: Add linked selection behavior**

On velocity chart:

- click selects GPS point
- mouseover updates selected GPS point when `dataIndex` is numeric
- brush selected x-axis range calls `onBrushSegment(start, end)`

If ECharts brush events are unreliable in tests, expose an accessible fallback button `Use visible velocity range as segment`.

- [ ] **Step 3: Add analysis charts**

Add:

- `Distance over time`
- `Velocity-derived acceleration`
- `Averages` panel for selected segment
- transform mode badge in chart header

- [ ] **Step 4: E2E check**

Add:

```ts
await page.getByRole("button", { name: "Charts" }).click();
await expect(page.getByRole("img", { name: "Distance over time chart" })).toBeVisible();
await expect(page.getByRole("img", { name: "Velocity-derived acceleration chart" })).toBeVisible();
await page.getByRole("button", { name: "Use visible velocity range as segment" }).click();
await page.getByRole("button", { name: "Export" }).click();
await expect(page.getByText("Selected points")).toBeVisible();
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Charts.tsx src/components/ChartPanel.tsx src/domain/analysis.ts tests/analyzer.spec.ts
git commit -m "Add linked analysis charts"
```

---

### Task 6: Tables, Visible Exports, Validation Rows, And File Summary

**Files:**
- Modify: `src/components/Tables.tsx`
- Modify: `src/domain/export.ts`
- Test: `tests/analyzer.spec.ts`

- [ ] **Step 1: Implement table tabs**

Tables view must contain tabs:

- GPS
- Enhanced
- Sensors
- Warnings
- Summary
- Validation

Each tab uses a shared sortable table pattern. Sort state must be stable and accessible.

- [ ] **Step 2: Add visible CSV export**

Add `Export visible rows` button. It must export the currently filtered and sorted rows, not all rows.

- [ ] **Step 3: Add validation table**

Validation table columns:

- index
- elapsed seconds
- speed km/h
- delta speed km/h
- derived acceleration m/s^2

- [ ] **Step 4: E2E check**

Add:

```ts
await page.getByRole("button", { name: "Tables" }).click();
await page.getByRole("tab", { name: "Validation" }).click();
await expect(page.getByRole("columnheader", { name: "Derived accel" })).toBeVisible();
await page.getByRole("button", { name: "Export visible rows" }).click();
```

Use Playwright download assertion for the export.

- [ ] **Step 5: Commit**

```bash
git add src/components/Tables.tsx src/domain/export.ts tests/analyzer.spec.ts
git commit -m "Upgrade data tables and validation exports"
```

---

### Task 7: Calibration Static Windows, Presets, Transform Modes, And Export Upgrade

**Files:**
- Modify: `src/components/CalibrationPanel.tsx`
- Modify: `src/components/ExportPanel.tsx`
- Modify: `src/domain/settings.ts`
- Modify: `src/domain/calibration.ts`
- Modify: `src/domain/export.ts`
- Test: `src/domain/__tests__/settings.test.ts`
- Test: `tests/analyzer.spec.ts`

- [ ] **Step 1: Add static window controls**

Calibration panel must expose:

- start elapsed seconds
- end elapsed seconds
- estimate from selected window
- estimate from current full file
- load CAL file
- reset calibration

- [ ] **Step 2: Add named presets**

Implement:

- preset name input
- save preset
- apply preset
- delete preset
- export presets JSON
- import presets JSON

Presets are stored under `openvta.calibrationPresets.v1`.

- [ ] **Step 3: Transform preview**

Show raw/calibrated/filtered/compare mode controls and ensure chart preview uses active transform mode labels.

- [ ] **Step 4: Export upgrade**

Export panel must use app-level segment state and include:

- Original segment `.Vta`
- Transformed segment `.Vta`
- GPS CSV
- Sensor CSV
- Validation CSV
- Summary JSON
- Line ending: LF / CRLF

- [ ] **Step 5: E2E check**

Add:

```ts
await page.getByRole("button", { name: "Calibration" }).click();
await page.getByLabel("Preset name").fill("Static pad");
await page.getByRole("button", { name: "Save preset" }).click();
await expect(page.getByText("Static pad")).toBeVisible();
await page.getByRole("button", { name: "Export" }).click();
await page.getByLabel("Line endings").selectOption("crlf");
await expect(page.getByRole("button", { name: "Export validation CSV" })).toBeVisible();
```

- [ ] **Step 6: Commit**

```bash
git add src/components/CalibrationPanel.tsx src/components/ExportPanel.tsx src/domain/settings.ts src/domain/calibration.ts src/domain/export.ts src/domain/__tests__/settings.test.ts tests/analyzer.spec.ts
git commit -m "Add calibration presets and expanded exports"
```

---

### Task 8: Documentation, Final UX Verification, CI, And Deployment Prep

**Files:**
- Modify: `README.md`
- Modify: `tests/analyzer.spec.ts`
- Optional: `docs/user-guide/legacy-vta-workflows.md`

- [ ] **Step 1: Update README**

Document:

- legacy VTA_Road parity scope
- what is intentionally not CAD
- supported formats
- map tile privacy
- calibration preset storage
- export options
- RCM and proprietary imports deferred

- [ ] **Step 2: Add final E2E checks**

Ensure tests cover:

- load sample
- source toggles
- map segment controls
- charts and validation chart
- table sorting/export
- calibration preset
- export panel
- mobile viewport

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all pass.

- [ ] **Step 4: Browser visual verification**

Start local dev or preview server and verify with browser screenshots:

- desktop overview: file rail, map route, summary, segment panel visible
- charts: linked charts visible without overlap
- tables: tabs and data table readable
- calibration: preset controls visible
- mobile: no overlapping toolbar text

- [ ] **Step 5: Commit**

```bash
git add README.md docs tests
git commit -m "Document redesigned analyzer workflows"
```

- [ ] **Step 6: Push branch**

```bash
git push -u origin codex/legacy-vta-ux-redesign
```

---

## Self-Review

- Spec coverage: The plan covers workspace/file management, map controls, chart linkage, segment extraction, calibration/filtering, tables/validation, reporting exports, design-system primitives, documentation, and verification. Deferred RCM/proprietary/CAD scope remains documented rather than implemented.
- Placeholder scan: No incomplete or unspecified implementation steps remain.
- Type consistency: `SourceVisibility`, `ActiveSegment`, `MapSettings`, `ChartSettings`, `TransformMode`, `ValidationRow`, and `CalibrationPreset` are introduced in Task 1 and reused consistently in later tasks.
