import { test, expect } from "@playwright/test";

test.describe("Kanban and Teams", () => {
  test("kanban board loads", async ({ page }) => {
    await page.goto("/kanban");
    await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
    await expect(page.getByTestId("ch-app-shell")).toBeVisible();
    await expect(page.getByRole("button", { name: "All Boards" })).toBeVisible();
  });

  test("teams page loads", async ({ page }) => {
    await page.goto("/orchestration/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    await expect(page.getByTestId("ch-app-shell")).toBeVisible();
  });

  test("navigate Kanban to Teams via header link", async ({ page }) => {
    await page.goto("/kanban");
    await page
      .getByTestId("ch-app-shell")
      .getByRole("link", { name: "Teams" })
      .last()
      .click();
    await expect(page).toHaveURL(/\/orchestration\/teams/);
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  });
});
