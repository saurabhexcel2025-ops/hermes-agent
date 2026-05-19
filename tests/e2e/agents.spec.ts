import { test, expect } from "@playwright/test";

test.describe("Agents page", () => {
  test("loads agent profiles list", async ({ page }) => {
    await page.goto("/operations/agents");
    await expect(
      page.getByRole("heading", { name: "Agents" })
    ).toBeVisible();
  });

  test("shows Hermes install selector (no fixed profile names)", async ({ page }) => {
    await page.goto("/operations/agents");
    await expect(
      page.getByText("Hermes install (all API paths use this root)")
    ).toBeVisible();
  });

  test("profile sync controls are visible", async ({ page }) => {
    await page.goto("/operations/agents");
    await expect(page.getByRole("button", { name: /Push all/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pull all/i })).toBeVisible();
  });

  test("New Agent button is visible", async ({ page }) => {
    await page.goto("/operations/agents");
    await expect(
      page.getByRole("button", { name: /New Agent/i })
    ).toBeVisible();
  });

  test("opens create modal on New Agent click", async ({ page }) => {
    await page.goto("/operations/agents");
    await page.getByRole("button", { name: /New Agent/i }).click();
    await expect(page.getByText("New Agent Profile")).toBeVisible();
    await expect(page.getByPlaceholder(/e\.g\. Research Assistant/i)).toBeVisible();
  });

  test("closes create modal on Cancel", async ({ page }) => {
    await page.goto("/operations/agents");
    await page.getByRole("button", { name: /New Agent/i }).click();
    await page.getByRole("button", { name: /Cancel/i }).click();
    await expect(page.getByText("New Agent Profile")).not.toBeVisible();
  });
});
