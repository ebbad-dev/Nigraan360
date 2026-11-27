import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5071";
const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function signIn(page: Page, email: string, password: string, landing: RegExp) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: /Sign in securely/ }).click();
  await expect(page).toHaveURL(landing);
}

async function expectNoSeriousViolations(page: Page, label: string) {
  // Let entrance animations (staggered table rows) finish so contrast is measured on final colours.
  await page.waitForTimeout(4000);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([]);
}

test("WCAG 2.2 AA: no serious or critical axe violations on key screens", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectNoSeriousViolations(page, "login");

  await signIn(page, "examiner@nigran360.demo", "Nigran360!Examiner", /\/instructor/);
  await expect(page.getByText("Question builder")).toBeVisible();
  await expectNoSeriousViolations(page, "examiner-dashboard");

  await page.goto("/bank");
  await expect(page.getByRole("heading", { name: "Question Bank" })).toBeVisible();
  await expectNoSeriousViolations(page, "question-bank");

  const login = await (await request.post(`${API}/auth/login`, { data: { email: "candidate2@nigran360.demo", password: "Nigran360!Candidate" } })).json();
  expect(login.access_token).toBeTruthy();
  await page.getByRole("button", { name: /Logout/ }).click();
  await signIn(page, "candidate2@nigran360.demo", "Nigran360!Candidate", /\/candidate/);
  await expect(page.getByRole("heading", { name: "My Exams" })).toBeVisible();
  await expectNoSeriousViolations(page, "candidate-dashboard");
});
