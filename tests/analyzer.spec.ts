import { expect, test } from "@playwright/test";

test("loads the sample and renders core analysis views", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open a VTA or ZIP file" })).toBeVisible();

  await page.getByRole("button", { name: "Load built-in sample" }).click();
  const analysisMain = page.locator(".analysis-main");
  await expect(analysisMain.getByRole("heading", { name: "OpenVTA_sample.Vta" })).toBeVisible();
  await expect(analysisMain.getByText("modern-openvta")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
  await expect(page.getByText("GPS 37")).toBeVisible();
  await expect(page.getByText("Enhanced 35")).toBeVisible();
  await expect(page.getByRole("button", { name: "Raw GPS" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Enhanced" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Compare" })).toBeVisible();
  await expect(page.getByText("Distance")).toBeVisible();
  await expect(page.getByLabel("Speed-colored route plot")).toBeVisible();

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
