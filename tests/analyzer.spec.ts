import { expect, test, type Locator } from "@playwright/test";

test("loads the sample and renders core analysis views", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open a VTA or ZIP file" })).toBeVisible();

  await page.getByRole("button", { name: "Load built-in sample" }).click();
  const analysisMain = page.locator(".analysis-main");
  await expect(analysisMain.getByRole("heading", { name: "OpenVTA_sample.Vta" })).toBeVisible();
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

  await page.getByRole("button", { name: "Charts" }).click();
  await expect(page.getByRole("img", { name: "Velocity chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Distance over time chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Velocity-derived acceleration chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Friction Circle chart" })).toBeVisible();
  await page.getByRole("button", { name: "Use visible velocity range as segment" }).click();
  await expect(metricValue(workspace, "Segment")).toHaveText(`0-${rawGpsCount - 1}`);
  await expect(metricValue(panelByHeading(analysisMain, "Averages"), "Selected points")).toHaveText(String(rawGpsCount));
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByText("Selected points")).toBeVisible();

  await page.getByRole("button", { name: "Tables" }).click();
  await page.getByRole("tab", { name: "Validation" }).click();
  await expect(page.getByRole("columnheader", { name: "Derived accel" })).toBeVisible();
  const tableDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export visible rows" }).click();
  const tableDownload = await tableDownloadPromise;
  expect(tableDownload.suggestedFilename()).toBe("validation-visible.csv");
});

test("applies sample calibration and exports summary", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load built-in sample" }).click();
  await page.getByRole("button", { name: "Sample CAL" }).click();

  await expect(page.getByRole("heading", { name: "Calibration and Filtering" })).toBeVisible();
  await expect(page.getByText("CAL_sample.Vta")).toBeVisible();
  await page.getByLabel("Low-pass filter").selectOption("on");
  await expect(page.getByLabel("Cutoff Hz")).toBeVisible();

  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Summary JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("summary.json");
});

test("keeps unavailable source toggles unpressed", async ({ page }) => {
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

function panelByHeading(scope: Locator, name: string | RegExp): Locator {
  return scope.locator(".panel").filter({ hasText: name });
}

function metricValue(scope: Locator, label: string): Locator {
  return scope.locator(".metric").filter({ hasText: label }).locator("strong");
}
