import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

const onboardingTourStorageKey = "openvta.onboardingTour.v1";
const languageStorageKey = "openvta.language.v1";

test("loads the sample and renders core analysis views", async ({ page }) => {
  await markTourCompleted(page);
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open a VTA or ZIP file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose files" })).toBeVisible();

  await page.getByRole("button", { name: "Load built-in sample" }).click();
  const analysisMain = page.locator(".analysis-main");
  await expect(analysisMain.getByRole("heading", { name: "OpenVTA_sample.Vta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open VTA/ZIP" })).toBeVisible();
  await expect(analysisMain.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expectTabControlsPanel(page, analysisMain.getByRole("tab", { name: "Overview" }));
  await analysisMain.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(analysisMain.getByRole("tab", { name: "Charts" })).toHaveAttribute("aria-selected", "true");
  await expect(analysisMain.getByRole("tab", { name: "Charts" })).toBeFocused();
  await expectTabControlsPanel(page, analysisMain.getByRole("tab", { name: "Charts" }));
  await page.keyboard.press("End");
  await expect(analysisMain.getByRole("tab", { name: "Export", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(analysisMain.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(analysisMain.getByText("modern-openvta")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
  const fileTray = page.locator(".file-rail");
  await expect(fileTray.getByRole("heading", { name: "OpenVTA_sample.Vta" })).toBeVisible();
  await expect(fileTray.getByText("modern-openvta")).toBeVisible();
  await expect(page.getByText("GPS 37")).toBeVisible();
  await expect(page.getByText("Enhanced 35")).toBeVisible();
  const rawGpsCountText = await fileTray.getByText(/^GPS \d+$/).textContent();
  const rawGpsCount = Number(rawGpsCountText?.match(/\d+/)?.[0] ?? 0);
  expect(rawGpsCount).toBeGreaterThan(0);
  await expect(fileTray.getByText("Sensor 185")).toBeVisible();
  await expect(fileTray.getByText("Warnings 0")).toBeVisible();
  await expect(fileTray.getByText("Active")).toBeVisible();
  await expect(fileTray.getByRole("button", { name: "Selected" })).toHaveAttribute("aria-pressed", "true");
  await expect(fileTray.getByRole("button", { name: "Remove OpenVTA_sample.Vta" })).toBeVisible();
  const workspace = page.locator(".analysis-inspector");
  const rawGpsButton = workspace.getByRole("button", { name: "Raw GPS" });
  const enhancedButton = workspace.getByRole("button", { name: "Enhanced" });
  await expect(rawGpsButton).toHaveAttribute("aria-pressed", "true");
  await expect(enhancedButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Compare" })).toBeVisible();

  await expect(page.getByText("Distance")).toBeVisible();
  await expect(page.getByLabel("Speed-colored route plot")).toBeVisible();
  await expect(page.getByText("Map tiles unavailable. Showing coordinate plot.")).toBeVisible();
  const fallbackPoints = page.locator("svg.coordinate-layer > circle");
  await expect(fallbackPoints.nth(0)).toBeVisible();

  const pointSizeInput = page.getByLabel("Point size");
  await pointSizeInput.fill("20");
  await expect(pointSizeInput).toHaveValue("14");
  await expect(fallbackPoints.nth(0)).toHaveAttribute("r", "14");
  await pointSizeInput.fill("5");
  await expect(pointSizeInput).toHaveValue("5");
  await expect(fallbackPoints.nth(0)).toHaveAttribute("r", "5");

  const selectedPointPanel = panelByHeading(analysisMain, "Selected Point");
  await page.getByRole("button", { name: "Set segment start" }).click();
  await fallbackPoints.nth(10).click();
  await expect(metricValue(selectedPointPanel, "Index")).toHaveText("10");
  await page.getByRole("button", { name: "Set segment end" }).click();
  const segmentPanel = panelByHeading(analysisMain, "Segment");
  await expect(segmentPanel).toBeVisible();
  await expect(segmentPanel.locator(".panel-header span")).toHaveText("0-10");
  await expect(metricValue(segmentPanel, "Segment points")).toHaveText("11");
  await expect(metricValue(segmentPanel, "Distance")).toHaveText(/0\.\d{3} km/);
  await expect(metricValue(segmentPanel, "Distance")).not.toHaveText("0.000 km");
  await expect(metricValue(workspace, "Segment")).toHaveText("0-10");

  await page.getByRole("button", { name: "Clear segment" }).click();
  await expect(panelByHeading(analysisMain, "Segment")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear segment" })).toBeDisabled();
  await expect(metricValue(workspace, "Segment")).toHaveText("All points");

  await page.getByRole("button", { name: "Set segment start" }).click();
  await fallbackPoints.nth(15).click();
  await expect(metricValue(selectedPointPanel, "Index")).toHaveText("15");
  await page.getByRole("button", { name: "Set segment end" }).click();
  await expect(panelByHeading(analysisMain, "Segment").locator(".panel-header span")).toHaveText("10-15");
  await page.getByRole("button", { name: "Create region" }).click();
  const regionPanel = panelByHeading(analysisMain, "Region");
  await expect(metricValue(regionPanel, "Region points")).toHaveText("72");

  await enhancedButton.click();
  await expect(enhancedButton).toHaveAttribute("aria-pressed", "false");
  await expect(rawGpsButton).toHaveAttribute("aria-pressed", "true");
  await expect(panelByHeading(analysisMain, "Segment")).toHaveCount(0);
  await expect(panelByHeading(analysisMain, "Region")).toHaveCount(0);
  await expect(metricValue(selectedPointPanel, "Index")).toHaveText("0");
  await expect(metricValue(workspace, "Segment")).toHaveText("All points");
  await rawGpsButton.click();
  await expect(rawGpsButton).toHaveAttribute("aria-pressed", "true");
  await expect(enhancedButton).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("tab", { name: "Charts" }).click();
  await expect(page.getByRole("img", { name: "Velocity chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Distance over time chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Velocity-derived acceleration chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Friction Circle chart" })).toBeVisible();
  await page.getByRole("button", { name: "Use visible velocity range as segment" }).click();
  await expect(metricValue(workspace, "Segment")).toHaveText(`0-${rawGpsCount - 1}`);
  await expect(metricValue(panelByHeading(analysisMain, "Averages"), "Selected points")).toHaveText(String(rawGpsCount));

  await page.getByRole("tab", { name: "Calibration" }).click();
  await page.getByRole("button", { name: "Estimate from current file" }).click();
  await page.getByLabel("Preset name").fill("Static pad");
  await page.getByRole("button", { name: "Save preset" }).click();
  await expect(page.getByText("Static pad")).toBeVisible();
  await page.getByLabel("Low-pass filter").selectOption("on");
  await page.locator('[aria-label="Transform mode"]').getByRole("button", { name: "Filtered" }).click();
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page.getByLabel("Line endings").selectOption("crlf");
  await expect(page.getByRole("button", { name: "Export validation CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export transformed segment .Vta" })).toBeVisible();
  await expect(page.getByText("Selected points")).toBeVisible();
  await page.getByLabel("Segment start point").fill("2");
  await page.getByLabel("Segment end point").fill("4");
  await expect(metricValue(analysisMain, "Selected points")).toHaveText("3");

  const transformedVta = await downloadTextByButton(
    page,
    "Export transformed segment .Vta",
    "OpenVTA_sample_transformed_segment.Vta",
  );
  expect(transformedVta).toContain("\r\n");
  expect(transformedVta).not.toMatch(/[^\r]\n/);
  expect(transformedVta).toContain("%% OpenVTA Analyzer Transformed Segment Export");
  expect(transformedVta).toContain("%% SegmentPointIndexes: 2-4");
  expect(transformedVta).toContain("%% TransformMode: filtered");
  expect(transformedVta).toContain("%% Calibration: unit=mps2; samples=185;");
  expect(transformedVta).toContain("source=OpenVTA_sample.Vta");
  expect(transformedVta).toContain("%% Filter: enabled=true; cutoffHz=5; channels=XYZ");

  const validationCsv = await downloadTextByButton(page, "Export validation CSV", "validation.csv");
  expect(validationCsv).toContain("\r\n");
  expect(validationCsv).not.toMatch(/[^\r]\n/);
  const validationLines = validationCsv.split("\r\n");
  expect(validationLines[0]).toBe("index,elapsedSeconds,speedKmh,deltaSpeedKmh,derivedAccelMps2");
  expect(validationLines).toHaveLength(3);
  expect(validationLines[1]).toMatch(/^3,1,\d+,\d+,/);

  const summaryJson = await downloadTextByButton(page, "Export Summary JSON", "summary.json");
  expect(summaryJson).toContain("\r\n");
  expect(summaryJson).not.toMatch(/[^\r]\n/);
  const summary = JSON.parse(summaryJson) as { stats: { gpsCount: number; enhancedCount: number; sensorCount: number } };
  expect(summary.stats.gpsCount).toBe(3);
  expect(summary.stats.enhancedCount).toBe(0);
  expect(summary.stats.sensorCount).toBe(10);

  const sensorCsv = await downloadTextByButton(page, "Export Sensor CSV", "sensor-points.csv");
  const sensorLines = sensorCsv.split("\r\n");
  expect(sensorLines[0]).toBe(
    "index,elapsedSeconds,eventCode,accelUnit,accelX,accelY,accelZ,orientationXDegrees,orientationYDegrees,orientationZDegrees",
  );
  expect(sensorLines.slice(1)).toHaveLength(10);
  await page.getByLabel("Segment start point").fill("0");
  await page.getByLabel("Segment end point").fill(String(rawGpsCount - 1));

  await page.getByRole("tab", { name: "Tables" }).click();
  await page.getByRole("tab", { name: "Validation" }).click();
  await expect(page.getByRole("columnheader", { name: "Derived accel" })).toBeVisible();
  const validationTable = page.getByRole("tabpanel", { name: "Validation" });
  const initialTableCounts = await tableStatusCounts(page);
  const validationIndexes = await validationTable.locator("tbody tr td:first-child").allTextContents();
  const filterQuery = await applyReducingFilter(page, validationIndexes, initialTableCounts.totalRows);
  const filteredTableCounts = await tableStatusCounts(page);
  expect(filteredTableCounts.totalRows).toBe(initialTableCounts.totalRows);
  expect(filteredTableCounts.visibleRows).toBeGreaterThan(1);
  expect(filteredTableCounts.visibleRows).toBeLessThan(initialTableCounts.totalRows);
  const firstIndexBeforeSort = await firstValidationTableCell(validationTable);
  await validationTable.getByRole("button", { name: "Index" }).click();
  await expect(validationTable.getByRole("columnheader", { name: "Index" })).toHaveAttribute("aria-sort", "descending");
  const firstVisibleCells = await validationTable.locator("tbody tr").first().locator("td").allTextContents();
  expect(firstVisibleCells[0].trim()).not.toBe(firstIndexBeforeSort);

  const tableDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export visible rows" }).click();
  const tableDownload = await tableDownloadPromise;
  expect(tableDownload.suggestedFilename()).toBe("validation-visible.csv");
  const tableDownloadPath = await tableDownload.path();
  if (!tableDownloadPath) {
    throw new Error("Expected validation export download to have a filesystem path.");
  }
  const tableCsv = await readFile(tableDownloadPath, "utf8");
  const tableCsvLines = tableCsv.trim().split(/\r?\n/);
  const exportedRows = tableCsvLines.slice(1);
  const firstExportedRow = exportedRows[0].split(",");

  expect(tableCsvLines[0]).toBe("index,elapsedSeconds,speedKmh,deltaSpeedKmh,derivedAccelMps2");
  expect(exportedRows).toHaveLength(filteredTableCounts.visibleRows);
  expect(exportedRows.length).toBeLessThan(initialTableCounts.totalRows);
  expect(exportedRows.every((row) => row.includes(filterQuery))).toBe(true);
  expect(firstExportedRow[0]).toBe(firstVisibleCells[0].trim());
  expect(Number(firstExportedRow[4])).toBeCloseTo(Number(firstVisibleCells[4]), 3);
});

test("persists Korean language and keeps the sample workflow usable", async ({ page }) => {
  await markTourCompleted(page);
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Open a VTA or ZIP file" })).toBeVisible();
  const englishLanguageSelector = page.getByLabel("Language");
  await expect(englishLanguageSelector).toHaveValue("en");

  await englishLanguageSelector.selectOption("ko");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { name: "VTA 또는 ZIP 파일 열기" })).toBeVisible();
  await expect(page.getByLabel("언어")).toHaveValue("ko");
  await expect(page.getByRole("button", { name: "파일 선택" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { name: "VTA 또는 ZIP 파일 열기" })).toBeVisible();
  await expect(page.getByLabel("언어")).toHaveValue("ko");

  await page.getByRole("button", { name: "내장 샘플 불러오기" }).click();
  const analysisMain = page.locator(".analysis-main");
  await expect(analysisMain.getByRole("heading", { name: "OpenVTA_sample.Vta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "VTA/ZIP 열기" })).toBeVisible();
  await expect(analysisMain.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
  await expectTabControlsPanel(page, analysisMain.getByRole("tab", { name: "개요" }));
  await expect(analysisMain.getByRole("heading", { name: "요약" })).toBeVisible();
  await expect(analysisMain.getByText("GPS / 향상 GPS")).toBeVisible();
  await expect(analysisMain.getByRole("heading", { name: "선택한 포인트" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await analysisMain.getByRole("tab", { name: "보정" }).click();
  await expect(analysisMain.getByRole("tab", { name: "보정" })).toHaveAttribute("aria-selected", "true");
  await expect(analysisMain.getByRole("heading", { name: "보정 및 필터링" })).toBeVisible();
  await expect(analysisMain.getByRole("button", { name: "CAL 파일 불러오기" })).toBeVisible();
  await expect(analysisMain.getByRole("button", { name: "현재 파일에서 추정" })).toBeVisible();
  await expect(analysisMain.getByRole("button", { name: "프리셋 JSON 가져오기" })).toBeVisible();
  await analysisMain.getByRole("button", { name: "현재 파일에서 추정" }).click();
  await expect(analysisMain.getByRole("status")).toContainText("현재 파일에서 샘플");
  await expect(analysisMain.getByLabel("저역 통과 필터")).toBeVisible();
  await analysisMain.getByLabel("저역 통과 필터").selectOption("on");
  await analysisMain.getByLabel("차단 주파수(Hz)").fill("9999");
  await expectNoHorizontalOverflow(page);

  await analysisMain.getByRole("tab", { name: "개요" }).click();
  await expect(analysisMain.getByText("차단 주파수가 유효 범위를 벗어나 필터를 건너뛰었습니다.")).toBeVisible();

  await analysisMain.getByRole("tab", { name: "내보내기", exact: true }).click();
  await expect(analysisMain.getByRole("heading", { name: "내보내기" })).toBeVisible();
  await expect(analysisMain.getByLabel("줄 끝 형식")).toBeVisible();
  await expect(analysisMain.getByText("선택한 포인트")).toBeVisible();
  await expect(analysisMain.getByRole("button", { name: "검증 CSV 내보내기" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("applies sample calibration and exports summary", async ({ page }) => {
  await markTourCompleted(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Load built-in sample" }).click();
  await page.getByRole("button", { name: "Sample CAL" }).click();

  await expect(page.getByRole("heading", { name: "Calibration and Filtering" })).toBeVisible();
  await expect(page.getByText("CAL_sample.Vta")).toBeVisible();

  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();
  const rawVta = await downloadTextByButton(
    page,
    "Export transformed segment .Vta",
    "OpenVTA_sample_transformed_segment.Vta",
  );
  expect(rawVta).toContain("%% TransformMode: raw");
  expect(rawVta).toContain("%% Calibration: none");
  expect(rawVta).toContain("%% Filter: none");

  await page.locator('[aria-label="Transform mode"]').getByRole("button", { name: "Calibrated" }).click();
  const calibratedVta = await downloadTextByButton(
    page,
    "Export transformed segment .Vta",
    "OpenVTA_sample_transformed_segment.Vta",
  );
  expect(calibratedVta).toContain("%% TransformMode: calibrated");
  expect(calibratedVta).toContain("%% Calibration: unit=mps2; samples=160;");
  expect(calibratedVta).toContain("source=CAL_sample.Vta");
  expect(calibratedVta).toContain("%% Filter: none");

  await page.getByRole("tab", { name: "Calibration" }).click();
  await page.getByLabel("Low-pass filter").selectOption("on");
  await expect(page.getByLabel("Cutoff Hz")).toBeVisible();
  await page.locator('[aria-label="Transform mode"]').getByRole("button", { name: "Filtered" }).click();
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  const filteredVta = await downloadTextByButton(
    page,
    "Export transformed segment .Vta",
    "OpenVTA_sample_transformed_segment.Vta",
  );
  expect(filteredVta).toContain("%% TransformMode: filtered");
  expect(filteredVta).toContain("%% Calibration: unit=mps2; samples=160;");
  expect(filteredVta).toContain("source=CAL_sample.Vta");
  expect(filteredVta).toContain("%% Filter: enabled=true; cutoffHz=5; channels=XYZ");

  await page.locator('[aria-label="Transform mode"]').getByRole("button", { name: "Compare" }).click();
  await expect(page.getByRole("button", { name: "Export transformed segment .Vta" })).toBeDisabled();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Summary JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("summary.json");
});

test("keeps unavailable source toggles unpressed", async ({ page }) => {
  await markTourCompleted(page);
  await page.goto("/");

  await page.locator(".dropzone input[type=file]").setInputFiles({
    name: "raw-only.Vta",
    mimeType: "text/plain",
    buffer: Buffer.from(
      [
        "%% VTALogger Kotlin Version: 0.0.3",
        "$17062026,152258,-33.875000000,151.224998333,12,26,0,6",
        "$17062026,152259,-33.876000000,151.225998333,13,31,0,6",
      ].join("\n"),
    ),
  });

  const analysisMain = page.locator(".analysis-main");
  const workspace = page.locator(".analysis-inspector");
  await expect(analysisMain.getByRole("heading", { name: "raw-only.Vta" })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Raw GPS" })).toHaveAttribute("aria-pressed", "true");
  await expect(workspace.getByRole("button", { name: "Enhanced" })).toHaveAttribute("aria-pressed", "false");

  await page.locator(".topbar input[type=file]").setInputFiles({
    name: "enhanced-only.Vta",
    mimeType: "text/plain",
    buffer: Buffer.from(
      [
        "%% VTALogger Kotlin Version: 0.0.3",
        "@17062026,152258,-33.875000000,151.224998333,12,26,0,6,5.0,gps,1,ImuHeading,0.9,preset,0",
        "@17062026,152259,-33.876000000,151.225998333,13,31,0,6,5.0,gps,2,ImuHeading,0.9,preset,1",
      ].join("\n"),
    ),
  });

  await expect(analysisMain.getByRole("heading", { name: "enhanced-only.Vta" })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Raw GPS" })).toHaveAttribute("aria-pressed", "false");
  await expect(workspace.getByRole("button", { name: "Enhanced" })).toHaveAttribute("aria-pressed", "true");
});

test("guided tour can be skipped and replayed from settings", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("dialog", { name: "Analyze VTA files locally" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Restart guide" }).click();
  await expect(page.getByRole("dialog", { name: "Analyze VTA files locally" })).toBeVisible();
});

test("guided tour loads sample and completes without reappearing", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/");

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Load sample for tour" }).click();
  await expect(page.locator(".analysis-main h2").filter({ hasText: "OpenVTA_sample.Vta" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Check the active file" })).toBeVisible();

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "Next" }).click();
  }
  await expect(page.getByRole("dialog", { name: "Export the result" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("guided tour supports Korean and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, "ko");
  }, languageStorageKey);
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("dialog", { name: "VTA 파일을 브라우저에서 분석" })).toBeVisible();
  await expect(page.getByRole("button", { name: "건너뛰기" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

function panelByHeading(scope: Locator, name: string | RegExp): Locator {
  return scope.locator(".panel").filter({ hasText: name });
}

function metricValue(scope: Locator, label: string): Locator {
  return scope.locator(".metric").filter({ hasText: label }).locator("strong");
}

async function applyReducingFilter(page: Page, indexTexts: string[], totalRows: number): Promise<string> {
  const searchInput = page.getByLabel("Search tables");
  const candidates = [
    ...new Set(
      indexTexts
        .flatMap((text) => text.trim().split(""))
        .filter((character) => /\d/.test(character)),
    ),
    ...indexTexts.map((text) => text.trim()),
  ].filter(Boolean);

  for (const candidate of candidates) {
    await searchInput.fill(candidate);
    const counts = await tableStatusCounts(page);
    if (counts.totalRows === totalRows && counts.visibleRows > 1 && counts.visibleRows < totalRows) {
      return candidate;
    }
  }

  throw new Error("Expected to find a validation table filter that reduces visible rows.");
}

async function tableStatusCounts(page: Page): Promise<{ visibleRows: number; totalRows: number }> {
  const text = await page.locator(".table-status").textContent();
  const match = text?.match(/:\s*(\d+)\s+of\s+(\d+)\s+rows/);
  if (!match) {
    throw new Error(`Unexpected table status: ${text ?? "<empty>"}`);
  }
  return {
    visibleRows: Number(match[1]),
    totalRows: Number(match[2]),
  };
}

async function firstValidationTableCell(validationTable: Locator): Promise<string> {
  return (await validationTable.locator("tbody tr").first().locator("td").first().textContent())?.trim() ?? "";
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    )
    .toBe(true);
}

async function expectTabControlsPanel(page: Page, tab: Locator): Promise<void> {
  const panelId = await tab.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  await expect(page.locator(`#${panelId}`)).toHaveCount(1);
}

async function downloadTextByButton(page: Page, buttonName: string, expectedFilename: string): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: buttonName }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(expectedFilename);
  const path = await download.path();
  if (!path) {
    throw new Error(`Expected ${expectedFilename} download to have a filesystem path.`);
  }
  return readFile(path, "utf8");
}

async function markTourCompleted(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ status: "completed", completedAt: 1700000000000, version: 1 }),
    );
  }, onboardingTourStorageKey);
}
