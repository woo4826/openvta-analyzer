import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

const onboardingTourStorageKey = "openvta.onboardingTour.v1";
const languageStorageKey = "openvta.language.v1";

test("imports a track before loading a VTA and explores automatic sectors", async ({ page }) => {
  await markTourCompleted(page);
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("https://overpass-api.de/**", (route) => route.abort());
  await page.route("https://overpass.kumi.systems/**", (route) => route.abort());
  await page.goto("/");

  await page.getByRole("button", { name: "Track Library" }).click();
  let dialog = page.getByRole("dialog", { name: "Track Library" });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "test-track-catalog.json",
    mimeType: "application/json",
    buffer: Buffer.from(testTrackCatalog()),
  });
  await expect(dialog.getByRole("heading", { name: "Automatic Sector Test Track" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply to current recording" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.locator(".dropzone input[type=file]").setInputFiles({
    name: "loop-session.Vta",
    mimeType: "text/plain",
    buffer: Buffer.from(loopVta()),
  });
  await page.getByRole("button", { name: "Track Library" }).click();
  dialog = page.getByRole("dialog", { name: "Track Library" });
  await dialog.getByRole("button", { name: "Apply to current recording" }).click();

  const analysisMain = page.locator(".analysis-main");
  await analysisMain.getByRole("tab", { name: "Lap Analysis" }).click();
  await expect(analysisMain.getByRole("tab", { name: "Segment Analysis Workbench" })).toHaveAttribute("aria-selected", "true");
  await expect(analysisMain.locator(".segment-workbench-header h2")).toHaveText("Automatic Sector Test Track");
  await expect(analysisMain.getByText("Where am I losing time?")).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) <= 680) {
    const workbenchBox = await analysisMain.locator(".segment-workbench").boundingBox();
    expect(workbenchBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(page.viewportSize()?.height ?? 0);
  }
  await expect(analysisMain.getByRole("region", { name: "Time-loss ranking" })).toHaveCount(0);
  await expect(analysisMain.getByRole("region", { name: "Trajectory map" })).toBeVisible();
  const dashboard = analysisMain.locator(".segment-dashboard-shell");
  const mapWidget = analysisMain.locator(".dashboard-widget-map");
  const dashboardBox = await dashboard.boundingBox();
  const initialMapBox = await mapWidget.boundingBox();
  expect(dashboardBox).not.toBeNull();
  expect(initialMapBox).not.toBeNull();
  expect(initialMapBox!.width / dashboardBox!.width).toBeGreaterThan(0.94);
  expect(initialMapBox!.height).toBeGreaterThan(650);

  const layerTrigger = analysisMain.getByRole("button", { name: "Lap layers" });
  await layerTrigger.click();
  let layerDialog = analysisMain.getByRole("dialog", { name: "Lap layers" });
  await expect(layerDialog.getByRole("button", { name: "Close lap layers" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(layerDialog).toHaveCount(0);
  await expect(layerTrigger).toBeFocused();
  await layerTrigger.click();
  layerDialog = analysisMain.getByRole("dialog", { name: "Lap layers" });
  const layerVisibility = layerDialog.getByRole("checkbox", { name: /Lap \d+ visible/ });
  expect(await layerVisibility.count()).toBeGreaterThan(1);
  await layerDialog.getByRole("button", { name: "Show all" }).click();
  await expect.poll(() => layerVisibility.evaluateAll((inputs) => inputs.every((input) => (input as HTMLInputElement).checked))).toBe(true);
  await layerDialog.getByRole("button", { name: "Auto styles" }).click();
  await expect.poll(() => layerVisibility.evaluateAll((inputs) => inputs.filter((input) => (input as HTMLInputElement).checked).length)).toBeLessThanOrEqual(2);
  await layerDialog.getByRole("button", { name: "Close lap layers" }).click();

  const focusedLapSelect = analysisMain.getByRole("combobox", { name: "Focused lap" });
  const referenceLapSelect = analysisMain.getByRole("combobox", { name: "Reference lap" });
  await expect(focusedLapSelect).toBeVisible();
  await expect(referenceLapSelect).toBeVisible();
  const scopeNavigator = analysisMain.locator(".segment-scope-navigator");
  const corner = scopeNavigator.getByRole("button", { name: /^Corner 1/ });
  await expect(corner).toBeVisible();
  expect((await corner.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await corner.click();
  await expect(corner).toHaveAttribute("aria-pressed", "true");
  await expect(analysisMain.getByText(/Corner 1 · \d+–\d+ m/)).toBeVisible();
  await expect(scopeNavigator.getByRole("combobox", { name: "Go to section" }))
    .toHaveValue(await corner.getAttribute("data-section-id") ?? "");
  await expect(analysisMain.locator('.coordinate-layer[aria-label="Lap trajectory comparison"]')).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) <= 680) {
    const layerBox = await layerTrigger.boundingBox();
    const toolbarBox = await analysisMain.locator(".segment-trajectory-map .map-toolbar").boundingBox();
    expect(layerBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();
    expect(layerBox!.y + layerBox!.height).toBeLessThanOrEqual(toolbarBox!.y);
    const fitButtonBox = await analysisMain.getByRole("button", { name: "Fit route" }).boundingBox();
    expect(fitButtonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const workbenchHeader = analysisMain.locator(".segment-workbench-header");
  const headerBeforeControls = await workbenchHeader.boundingBox();
  expect(headerBeforeControls).not.toBeNull();
  await analysisMain.getByRole("button", { name: "Analysis controls" }).click();
  let controls = page.getByRole("dialog", { name: "Analysis controls" });
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const viewportHeight = page.viewportSize()?.height ?? 0;
  const controlsBox = await controls.boundingBox();
  expect(controlsBox).not.toBeNull();
  expect(controlsBox!.height).toBeGreaterThan(viewportHeight * 0.8);
  await expect(controls).toHaveAttribute("aria-modal", "true");
  await expect(controls.getByRole("region", { name: "Track section navigator" })).toHaveCount(0);
  await expect(scopeNavigator.getByRole("slider", { name: "Range start" })).toBeVisible();
  if (viewportWidth > 1180) {
    await expect.poll(async () => (await workbenchHeader.boundingBox())!.x - headerBeforeControls!.x).toBeGreaterThan(400);
    await expect.poll(async () => {
      const current = await workbenchHeader.boundingBox();
      return Math.abs((current!.x + current!.width) - (headerBeforeControls!.x + headerBeforeControls!.width));
    }).toBeLessThan(2);
  } else {
    await expect.poll(async () => Math.abs((await workbenchHeader.boundingBox())!.x - headerBeforeControls!.x)).toBeLessThan(2);
    if (viewportWidth <= 680) {
      await expect(page.locator(".segment-controls-scrim")).toBeVisible();
    }
  }
  await expect(controls.getByRole("button", { name: "Close analysis controls" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(controls).toHaveCount(0);
  await expect(analysisMain.getByRole("button", { name: "Analysis controls" })).toBeFocused();
  if (viewportWidth > 1180) {
    await analysisMain.getByRole("button", { name: "Analysis controls" }).click();
    await analysisMain.getByRole("tab", { name: "Charts" }).click();
    await expect(page.getByRole("dialog", { name: "Analysis controls" })).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/lap-analysis-controls-open/);
    await analysisMain.getByRole("tab", { name: "Lap Analysis" }).click();
    await expect(scopeNavigator.getByRole("button", { name: /^Corner 1/ })).toHaveAttribute("aria-pressed", "true");
  }

  await expect.poll(async () => analysisMain.locator(".dashboard-widget-variation canvas, .dashboard-widget-telemetry canvas").evaluateAll((canvases) =>
    canvases.length === 4 && canvases.every((canvas) => {
      const surface = canvas as HTMLCanvasElement;
      return surface.width > 0 && surface.height > 0;
    })
  )).toBe(true);
  await expect(analysisMain.getByRole("img", { name: "Segment time by lap and segment time versus driven path charts" })).toBeVisible();
  await expect(analysisMain.getByRole("img", { name: "Speed comparison by distance" })).toBeVisible();
  await expect(analysisMain.getByRole("img", { name: "Delta-T by distance" })).toBeVisible();
  await expect(analysisMain.getByRole("img", { name: "Measured acceleration by distance" })).toBeVisible();
  await expect(analysisMain.getByRole("img", { name: "Focused and reference trajectories with synchronized cursor markers" })).toBeVisible();
  const telemetryGrid = analysisMain.locator(".segment-telemetry-grid");
  const threeColumnLayout = analysisMain.getByRole("button", { name: "3-column dashboard" });
  const twoPlusOneLayout = analysisMain.getByRole("button", { name: "2+1", exact: true });
  const stackedLayout = analysisMain.getByRole("button", { name: "3 stacked" });
  await expect(telemetryGrid).toHaveAttribute("data-layout", "three-column");
  await expect(threeColumnLayout).toHaveAttribute("aria-pressed", "true");
  await twoPlusOneLayout.click();
  await expect(telemetryGrid).toHaveAttribute("data-layout", "two-plus-one");
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("openvta.segmentWorkbench.v2") ?? "{}")?.telemetryLayout)).toBe("two-plus-one");
  await stackedLayout.click();
  await expect(telemetryGrid).toHaveAttribute("data-layout", "three-stacked");
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("openvta.segmentWorkbench.v2") ?? "{}")?.telemetryLayout)).toBe("three-stacked");
  await threeColumnLayout.click();
  await expect(telemetryGrid).toHaveAttribute("data-layout", "three-column");
  if ((page.viewportSize()?.width ?? 0) <= 680) {
    const metricCardBoxes = await analysisMain.locator(".segment-telemetry-metric-card").evaluateAll((cards) => cards.map((card) => {
      const box = card.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width) };
    }));
    expect(new Set(metricCardBoxes.map((box) => box.y)).size).toBe(3);
    expect(Math.max(...metricCardBoxes.map((box) => box.x)) - Math.min(...metricCardBoxes.map((box) => box.x))).toBeLessThanOrEqual(1);
    expect(Math.max(...metricCardBoxes.map((box) => box.width)) - Math.min(...metricCardBoxes.map((box) => box.width))).toBeLessThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("openvta.segmentWorkbench.v2") ?? "{}")?.telemetryLayout)).toBe("three-column");
  }
  await expect(analysisMain.getByText(/Focused − Reference; a negative value/)).toBeVisible();
  await expect(analysisMain.getByText(/raw focused-lap device axes/)).toBeVisible();
  await expect(analysisMain.locator(".segment-comparison-bar .sr-only")).toHaveCSS("clip-path", "inset(50%)");
  await expect(analysisMain.locator(".segment-comparison-bar .sr-only")).toHaveCSS("width", "1px");
  await expect(analysisMain.locator(".segment-telemetry-readout")).toContainText(/Timestamp · [1-9]\d* samples/);
  await analysisMain.locator(".dashboard-widget-telemetry").scrollIntoViewIfNeeded();
  if ((page.viewportSize()?.width ?? 0) > 680) {
    const comparisonBox = await analysisMain.locator(".segment-comparison-bar").boundingBox();
    const ribbonBox = await scopeNavigator.boundingBox();
    expect(comparisonBox).not.toBeNull();
    expect(ribbonBox).not.toBeNull();
    expect(comparisonBox!.y).toBeGreaterThanOrEqual(0);
    expect(comparisonBox!.y + comparisonBox!.height).toBeLessThanOrEqual(ribbonBox!.y + 1);
  }
  const telemetryWidgetBox = await analysisMain.locator(".dashboard-widget-telemetry").boundingBox();
  const telemetryContextBox = await analysisMain.locator(".segment-telemetry-context").boundingBox();
  expect(telemetryWidgetBox).not.toBeNull();
  expect(telemetryContextBox).not.toBeNull();
  expect(telemetryContextBox!.y + telemetryContextBox!.height).toBeLessThanOrEqual(telemetryWidgetBox!.y + telemetryWidgetBox!.height + 1);
  await expect(analysisMain.getByRole("button", { name: "Detailed channels" })).toHaveCount(0);
  await expect(analysisMain.getByRole("button", { name: "Select range", exact: true })).toHaveCount(0);
  await expect(analysisMain.getByRole("button", { name: "Zoom", exact: true })).toHaveCount(0);
  await expect(analysisMain.getByRole("button", { name: "Reset", exact: true })).toHaveCount(0);
  const cursorDistance = analysisMain.locator(".segment-telemetry-readout > div").first().locator("dd");
  const focusedTrackMarker = analysisMain.getByTestId("focused-track-marker");
  const markerBeforeHover = await focusedTrackMarker.evaluate((marker) => `${marker.getAttribute("cx")},${marker.getAttribute("cy")}`);
  for (const metric of ["speed", "delta", "imu-acceleration"]) {
    const telemetryCanvas = analysisMain.locator(`.segment-telemetry-metric-card.is-${metric} canvas`);
    await telemetryCanvas.scrollIntoViewIfNeeded();
    const telemetryBox = await telemetryCanvas.boundingBox();
    expect(telemetryBox).not.toBeNull();
    await page.mouse.move(2, 2);
    const cursorBeforeEarlyHover = await cursorDistance.textContent();
    await page.mouse.move(telemetryBox!.x + 112, telemetryBox!.y + telemetryBox!.height * 0.58);
    await expect.poll(
      () => cursorDistance.textContent(),
      { message: `${metric} chart first hover should move the shared cursor` },
    ).not.toBe(cursorBeforeEarlyHover);
    const earlyCursor = await cursorDistance.textContent();
    await page.mouse.move(telemetryBox!.x + telemetryBox!.width - 36, telemetryBox!.y + telemetryBox!.height * 0.58);
    await expect.poll(
      () => cursorDistance.textContent(),
      { message: `${metric} chart hover should move the shared cursor` },
    ).not.toBe(earlyCursor);
  }
  await expect.poll(() => focusedTrackMarker.evaluate((marker) => `${marker.getAttribute("cx")},${marker.getAttribute("cy")}`)).not.toBe(markerBeforeHover);
  if ((page.viewportSize()?.width ?? 0) > 680) {
    const metricCanvases = analysisMain.locator(".segment-telemetry-metric-card canvas");
    const canvasesBeforeDrag = await Promise.all([0, 1, 2].map((index) => metricCanvases.nth(index).screenshot()));
    const speedCanvas = analysisMain.locator(".segment-telemetry-metric-card.is-speed canvas");
    const speedBox = await speedCanvas.boundingBox();
    expect(speedBox).not.toBeNull();
    await page.mouse.move(speedBox!.x + speedBox!.width * 0.32, speedBox!.y + speedBox!.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(speedBox!.x + speedBox!.width * 0.78, speedBox!.y + speedBox!.height * 0.55, { steps: 12 });
    await page.mouse.up();
    const showAllTelemetry = analysisMain.getByRole("button", { name: "Show all", exact: true });
    await expect(showAllTelemetry).toBeVisible();
    const canvasesAfterDrag = await Promise.all([0, 1, 2].map((index) => metricCanvases.nth(index).screenshot()));
    expect(canvasesAfterDrag.every((image, index) => !image.equals(canvasesBeforeDrag[index]))).toBe(true);
    await showAllTelemetry.click();
    await expect(showAllTelemetry).toHaveCount(0);
  }
  const accelerationChart = analysisMain.getByRole("img", { name: "Measured acceleration by distance" });
  await accelerationChart.focus();
  const keyboardCursorBefore = await cursorDistance.textContent();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => cursorDistance.textContent()).not.toBe(keyboardCursorBefore);

  await analysisMain.getByRole("button", { name: "Analysis controls" }).click();
  controls = page.getByRole("dialog", { name: "Analysis controls" });
  await controls.getByRole("button", { name: "Time", exact: true }).click();
  await expect(controls.getByRole("button", { name: "Time", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(controls.getByRole("checkbox", { name: /Include completed sectors from partial laps/ })).toBeVisible();
  await controls.getByRole("combobox", { name: "Visible laps" }).selectOption("focus-only");
  await expect(controls.getByRole("checkbox", { name: "Time-loss ranking" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("openvta.segmentWorkbench.v2") ?? "{}")?.lapVisibility)).toBe("focus-only");
  await controls.getByRole("button", { name: "Close analysis controls" }).click();

  const timeDeltaChart = analysisMain.getByRole("img", { name: "Delta-T by time" });
  await timeDeltaChart.scrollIntoViewIfNeeded();
  const timeDeltaBox = await timeDeltaChart.boundingBox();
  expect(timeDeltaBox).not.toBeNull();
  const timeCursorBefore = await cursorDistance.textContent();
  await page.mouse.move(timeDeltaBox!.x + timeDeltaBox!.width * 0.34, timeDeltaBox!.y + timeDeltaBox!.height * 0.58);
  await expect.poll(() => cursorDistance.textContent()).not.toBe(timeCursorBefore);

  const focusedLapBeforeRoundTrip = await focusedLapSelect.inputValue();
  await twoPlusOneLayout.click();
  await analysisMain.getByRole("tab", { name: "Overview" }).click();
  await analysisMain.getByRole("tab", { name: "Lap Analysis" }).click();
  await expect(scopeNavigator.getByRole("button", { name: /^Corner 1/ })).toHaveAttribute("aria-pressed", "true");
  await expect(focusedLapSelect).toHaveValue(focusedLapBeforeRoundTrip);
  await expect(telemetryGrid).toHaveAttribute("data-layout", "two-plus-one");
  await threeColumnLayout.click();

  await expect(analysisMain.getByRole("region", { name: "Time-loss ranking" })).toHaveCount(0);
  const lapRecords = analysisMain.getByRole("region", { name: "Lap evidence table" });
  await expect(lapRecords.getByRole("columnheader", { name: "Driven path" })).toBeVisible();
  await expect(lapRecords.locator("tbody tr")).toHaveCount(1);

  if ((page.viewportSize()?.width ?? 0) > 680) {
    const savedMapLayout = () => page.evaluate(() => {
      const preferences = JSON.parse(window.localStorage.getItem("openvta.segmentWorkbench.v2") ?? "{}");
      return preferences.layouts?.lg?.find((item: { i: string }) => item.i === "map") as { x: number; y: number; h: number } | undefined;
    });
    await mapWidget.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 320));
    const resizeHandle = analysisMain.locator(".react-grid-item:has(.dashboard-widget-map) > .react-resizable-handle");
    const resizeBox = await resizeHandle.boundingBox();
    const mapBeforeResize = await savedMapLayout();
    expect(resizeBox).not.toBeNull();
    await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2 + 90);
    await page.mouse.up();
    await expect.poll(async () => (await savedMapLayout())?.h).not.toBe(mapBeforeResize?.h);
  }

  const exportDownload = page.waitForEvent("download");
  await analysisMain.getByRole("button", { name: "Export CSV" }).click();
  expect((await exportDownload).suggestedFilename()).toBe("loop-session.segment-analysis.csv");
  await expect(analysisMain.locator(".segment-export-status")).toHaveText("Exported loop-session.segment-analysis.csv");

  await analysisMain.getByRole("tab", { name: "Setup" }).click();
  await expect(analysisMain.getByRole("button", { name: "Export analysis sectors CSV" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

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
  await expect(analysisMain.getByRole("tab", { name: "Lap Analysis" })).toHaveAttribute("aria-selected", "true");
  await expect(analysisMain.getByRole("tab", { name: "Lap Analysis" })).toBeFocused();
  await expectTabControlsPanel(page, analysisMain.getByRole("tab", { name: "Lap Analysis" }));
  await page.keyboard.press("ArrowRight");
  await expect(analysisMain.getByRole("tab", { name: "Charts" })).toHaveAttribute("aria-selected", "true");
  await expect(analysisMain.getByRole("tab", { name: "Charts" })).toBeFocused();
  await expectTabControlsPanel(page, analysisMain.getByRole("tab", { name: "Charts" }));
  await page.keyboard.press("End");
  await expect(analysisMain.getByRole("tab", { name: "Export", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(analysisMain.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(analysisMain.getByText("modern-openvta")).toBeVisible();
  await expect(page.locator(".file-rail")).toHaveCount(0);
  const fileWorkspaceTrigger = page.locator(".topbar-file-trigger");
  await expect(fileWorkspaceTrigger).toContainText("OpenVTA_sample.Vta");
  await fileWorkspaceTrigger.click();
  const fileWorkspace = page.getByRole("dialog", { name: "Files" });
  await expect(fileWorkspace.getByRole("heading", { name: "OpenVTA_sample.Vta" })).toBeVisible();
  await expect(fileWorkspace.getByText("modern-openvta")).toBeVisible();
  await expect(fileWorkspace.getByText("GPS 37")).toBeVisible();
  await expect(fileWorkspace.getByText("Enhanced 35")).toBeVisible();
  const rawGpsCountText = await fileWorkspace.getByText(/^GPS \d+$/).textContent();
  const rawGpsCount = Number(rawGpsCountText?.match(/\d+/)?.[0] ?? 0);
  const enhancedGpsCountText = await fileWorkspace.getByText(/^Enhanced \d+$/).textContent();
  const enhancedGpsCount = Number(enhancedGpsCountText?.match(/\d+/)?.[0] ?? 0);
  expect(rawGpsCount).toBeGreaterThan(0);
  await expect(fileWorkspace.getByText("Sensor 185")).toBeVisible();
  await expect(fileWorkspace.getByText("Warnings 0")).toBeVisible();
  await expect(fileWorkspace.getByText("Active", { exact: true })).toBeVisible();
  await expect(fileWorkspace.locator(".topbar-file-select")).toHaveAttribute("aria-pressed", "true");
  await expect(fileWorkspace.getByRole("button", { name: "Remove OpenVTA_sample.Vta" })).toBeVisible();
  await fileWorkspace.getByRole("button", { name: "Close" }).click();
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
  const pointTimeline = page.getByRole("slider", { name: "Point timeline" });
  await expect(pointTimeline).toHaveValue("0");
  await expect(pointTimeline).toHaveAttribute("max", String(rawGpsCount + enhancedGpsCount - 1));
  await pointTimeline.fill("10");
  await expect(pointTimeline).toHaveAttribute("aria-valuetext", new RegExp(`Point 11 of ${rawGpsCount + enhancedGpsCount}`));
  await expect(metricValue(selectedPointPanel, "Index")).toHaveText("10");
  await pointTimeline.press("ArrowRight");
  await expect(metricValue(selectedPointPanel, "Index")).toHaveText("11");
  await pointTimeline.fill("0");
  await expect(metricValue(selectedPointPanel, "Index")).toHaveText("0");
  await page.getByRole("button", { name: "Set segment start" }).click();
  await page.getByTestId("route-hit-10").click();
  await expect(metricValue(selectedPointPanel, "Index")).toHaveText("10");
  await page.getByRole("button", { name: "Set segment end" }).click();
  const segmentPanel = panelByHeading(analysisMain, "Segment");
  await expect(segmentPanel).toBeVisible();
  await expect(segmentPanel.locator(".panel-header span")).toHaveText("0-10");
  await expect(metricValue(segmentPanel, "Segment points")).toHaveText("11");
  await expect(metricValue(segmentPanel, "Distance")).toHaveText(/0\.\d{3} km/);
  await expect(metricValue(segmentPanel, "Distance")).not.toHaveText("0.000 km");
  await expect(metricValue(workspace, "Segment")).toHaveText(`1–11 of ${rawGpsCount + enhancedGpsCount}`);

  await page.getByRole("button", { name: "Clear segment" }).click();
  await expect(panelByHeading(analysisMain, "Segment")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear segment" })).toBeDisabled();
  await expect(metricValue(workspace, "Segment")).toHaveText(`All ${rawGpsCount + enhancedGpsCount} points`);

  await page.getByRole("button", { name: "Set segment start" }).click();
  await page.getByTestId("route-hit-15").click();
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
  await expect(pointTimeline).toHaveAttribute("max", String(rawGpsCount - 1));
  await expect(pointTimeline).toHaveValue("0");
  await expect(metricValue(workspace, "Segment")).toHaveText(`All ${rawGpsCount} points`);
  await rawGpsButton.click();
  await expect(rawGpsButton).toHaveAttribute("aria-pressed", "true");
  await expect(enhancedButton).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("tab", { name: "Charts" }).click();
  await expect(page.getByRole("img", { name: "Velocity chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Distance over time chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Velocity-derived acceleration chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Friction Circle chart" })).toBeVisible();
  await page.getByRole("button", { name: "Use visible velocity range as segment" }).click();
  await expect(metricValue(workspace, "Segment")).toHaveText(`1–${rawGpsCount} of ${rawGpsCount}`);
  await expect(metricValue(panelByHeading(analysisMain, "Averages"), "Selected points")).toHaveText(String(rawGpsCount));

  await page.getByRole("tab", { name: "Calibration" }).click();
  await page.getByRole("button", { name: "Estimate from current file" }).click();
  await page.getByLabel("Preset name").fill("Static pad");
  await page.getByRole("button", { name: "Save preset" }).click();
  await expect(page.getByText("Static pad")).toBeVisible();
  await page.getByLabel("Low-pass filter").selectOption("on");
  await page.getByLabel("Cutoff Hz").fill("1");
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
  expect(transformedVta).toContain("%% Filter: enabled=true; cutoffHz=1; channels=XYZ");

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
  await page.getByLabel("Cutoff Hz").fill("1");
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
  expect(filteredVta).toContain("%% Filter: enabled=true; cutoffHz=1; channels=XYZ");

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
  const loadTourSample = page.getByRole("button", { name: "Load sample for tour" });
  await expect(loadTourSample).toBeVisible();
  await loadTourSample.click({ force: true });
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

function testTrackCatalog(): string {
  return JSON.stringify({
    schemaVersion: 1,
    kind: "openvta-track-catalog",
    tracks: [{
      schemaVersion: 1,
      id: "automatic-sector-test-track",
      name: "Automatic Sector Test Track",
      centerline: {
        type: "LineString",
        coordinates: [[0, 0], [0.0005, 0], [0.0008, 0.0004], [0, 0.0008], [-0.0008, 0.0004], [-0.0005, 0], [0, 0]],
      },
      direction: "counterclockwise",
      startFinish: {
        id: "start-finish",
        name: "Start / Finish",
        kind: "start-finish",
        line: { type: "LineString", coordinates: [[0, -0.0003], [0, 0.0003]] },
        forwardBearingDegrees: 90,
        widthMeters: 66,
      },
      sectorGates: [],
      sections: [],
      source: { kind: "user" },
      updatedAt: "2026-07-15T00:00:00.000Z",
    }],
  });
}

function loopVta(): string {
  const coordinates: Array<[number, number]> = [
    [-0.0005, 0], [0.0005, 0], [0.0008, 0.0004], [0, 0.0008], [-0.0008, 0.0004], [-0.0005, 0],
    [0.0005, 0], [0.0009, 0.0003], [0, 0.00085], [-0.0009, 0.0003], [-0.0005, 0],
    [0.0005, 0], [0.0008, 0.0004], [0, 0.0008], [-0.0008, 0.0004], [-0.0005, 0], [0.0005, 0],
  ];
  return [
    "%% VTALogger Kotlin Version: 0.0.3",
    "%% FormatVersion: 3",
    ...coordinates.flatMap(([longitude, latitude], index) => [
      `$15072026,1011${String(index).padStart(2, "0")},${latitude.toFixed(9)},${longitude.toFixed(9)},0,${70 + index % 4 * 8},90,10,2.5,gps,${500_000_000_000 + index * 1_000_000_000}`,
      ...Array.from({ length: 4 }, (_, tick) => {
        const sensorIndex = index * 4 + tick;
        const elapsedSeconds = index + (tick + 1) / 5;
        return `#${sensorIndex},${elapsedSeconds.toFixed(3)},0,0,0,0,${(Math.sin(elapsedSeconds) * 1.2).toFixed(3)},${(Math.cos(elapsedSeconds) * 1.4).toFixed(3)},9.807,${500_000_000_000 + index * 1_000_000_000 + (tick + 1) * 200_000_000},2`;
      }),
    ]),
    "%% End",
  ].join("\n");
}
