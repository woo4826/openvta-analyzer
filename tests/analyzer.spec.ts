import { expect, test } from "@playwright/test";

test("loads the sample and renders core analysis views", async ({ page }) => {
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
  await expect(fileTray.getByText("Sensor 185")).toBeVisible();
  await expect(fileTray.getByText("Warnings 0")).toBeVisible();
  await expect(fileTray.getByText("Active")).toBeVisible();
  await expect(fileTray.getByRole("button", { name: "Selected" })).toHaveAttribute("aria-pressed", "true");
  await expect(fileTray.getByRole("button", { name: "Remove OpenVTA_sample.Vta" })).toBeVisible();
  const rawGpsButton = page.getByRole("button", { name: "Raw GPS" });
  const enhancedButton = page.getByRole("button", { name: "Enhanced" });
  await expect(rawGpsButton).toHaveAttribute("aria-pressed", "true");
  await expect(enhancedButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Compare" })).toBeVisible();

  await enhancedButton.click();
  await expect(enhancedButton).toHaveAttribute("aria-pressed", "false");
  await expect(rawGpsButton).toHaveAttribute("aria-pressed", "true");
  await rawGpsButton.click();
  await expect(rawGpsButton).toHaveAttribute("aria-pressed", "true");
  await expect(enhancedButton).toHaveAttribute("aria-pressed", "false");

  await expect(page.getByText("Distance")).toBeVisible();
  await expect(page.getByLabel("Speed-colored route plot")).toBeVisible();
  await page.getByRole("button", { name: "Set segment start" }).click();
  await page.getByRole("button", { name: "Set segment end" }).click();
  await expect(analysisMain.getByRole("heading", { name: "Segment" })).toBeVisible();
  await page.getByRole("button", { name: "Create region" }).click();
  await expect(page.getByText("Region points")).toBeVisible();

  await page.getByRole("button", { name: "Charts" }).click();
  await expect(page.getByRole("img", { name: "Velocity chart" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Friction Circle chart" })).toBeVisible();

  await page.getByRole("button", { name: "Tables" }).click();
  await expect(page.getByRole("heading", { name: /GPS and enhanced points/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sensor rows/ })).toBeVisible();
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
