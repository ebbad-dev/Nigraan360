import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5071";
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@nigran360.demo", password: process.env.E2E_ADMIN_PASSWORD ?? "Nigran360!Admin" };
const EXAMINER = { email: process.env.E2E_EXAMINER_EMAIL ?? "examiner@nigran360.demo", password: process.env.E2E_EXAMINER_PASSWORD ?? "Nigran360!Examiner" };

async function login(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  return res.json();
}

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: /Sign in securely/ }).click();
  await expect(page).toHaveURL(/\/candidate/);
}

/** Fresh synthetic exam + candidate so every run starts from a clean attempt. */
async function setupExam(request: APIRequestContext) {
  const tag = Math.random().toString(36).slice(2, 8);
  const admin = await login(request, ADMIN.email, ADMIN.password);
  const candidateEmail = `e2e-ui-${tag}@nigran360.test`;
  const password = `Ui!${tag}Pass2026`;
  const created = await request.post(`${API}/admin/users`, {
    headers: { Authorization: `Bearer ${admin.access_token}` },
    data: { email: candidateEmail, full_name: `UI Candidate ${tag}`, role: "student", password },
  });
  expect(created.ok(), await created.text()).toBeTruthy();

  const examiner = await login(request, EXAMINER.email, EXAMINER.password);
  const h = { Authorization: `Bearer ${examiner.access_token}` };
  const now = Date.now();
  const exam = await (
    await request.post(`${API}/exams`, {
      headers: h,
      data: {
        exam_code: `UI${tag.toUpperCase()}`,
        title: `Resilience UAT ${tag}`,
        duration_minutes: 30,
        total_marks: 0,
        start_time: new Date(now - 5 * 60_000).toISOString(),
        end_time: new Date(now + 2 * 3600_000).toISOString(),
        status: "draft",
      },
    })
  ).json();
  const questions = [
    { question_text: "Capital of Pakistan?", options: ["Lahore", "Islamabad", "Karachi"], correct: 1 },
    { question_text: "Largest planet?", options: ["Mars", "Earth", "Jupiter"], correct: 2 },
  ];
  for (const [index, q] of questions.entries()) {
    const res = await request.post(`${API}/exams/${exam.id}/questions`, {
      headers: h,
      data: {
        question_text: q.question_text,
        question_type: "mcq",
        marks: 1,
        sort_order: index,
        options: q.options.map((text, i) => ({ option_text: text, is_correct: i === q.correct, sort_order: i })),
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  await request.post(`${API}/exams/${exam.id}/questions`, {
    headers: h,
    data: { question_text: "Describe one cause of network outages.", question_type: "written", marks: 3, sort_order: 2 },
  });
  expect((await request.post(`${API}/exams/${exam.id}/publish`, { headers: h })).ok()).toBeTruthy();
  expect((await request.post(`${API}/exams/${exam.id}/assignments`, { headers: h, data: { student_email: candidateEmail } })).ok()).toBeTruthy();
  const candidate = await login(request, candidateEmail, password);
  return { exam, candidate, candidateEmail, password };
}

test("5.3 failure-resilient attempt: offline edits stay pending, sync on reconnect, deadline unchanged", async ({ page, context, request }) => {
  const { exam, candidate, candidateEmail, password } = await setupExam(request);
  await signInAs(page, candidateEmail, password);

  // Candidate dashboard -> start exam with roll number.
  await expect(page.getByRole("heading", { name: "My Exams" })).toBeVisible();
  const card = page.locator("div", { hasText: exam.title }).filter({ has: page.getByRole("button", { name: /Start exam/ }) }).last();
  await card.getByRole("button", { name: /Start exam/ }).click();
  await page.getByPlaceholder("e.g. FA23-BCS-001").fill("UAT-5-3");
  await page.getByRole("button", { name: /Confirm & start/ }).click();
  await expect(page).toHaveURL(/\/exam\?attempt_id=/);
  const attemptId = new URL(page.url()).searchParams.get("attempt_id")!;
  const auth = { Authorization: `Bearer ${candidate.access_token}` };
  const before = await (await request.get(`${API}/attempts/${attemptId}`, { headers: auth })).json();

  await expect(page.getByTestId("connection-banner")).toHaveAttribute("data-state", /online|reconnected/);

  // 1. Online answer is confirmed by the server.
  await page.getByText("Islamabad", { exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved on server");

  // 2. Network interruption: answer another question while offline.
  await context.setOffline(true);
  await expect(page.getByTestId("connection-banner")).toHaveAttribute("data-state", "offline");
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByText("Jupiter", { exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Pending sync");
  await expect(page.getByTestId("connection-banner")).toContainText("NOT yet saved on the server");
  const timerOffline1 = await page.getByTestId("exam-timer").textContent();
  await page.waitForTimeout(2500);
  const timerOffline2 = await page.getByTestId("exam-timer").textContent();
  expect(timerOffline2, "timer keeps running while offline").not.toEqual(timerOffline1);

  // The pending change survives in durable local storage, never presented as saved.
  const stored = await page.evaluate((id) => window.localStorage.getItem(`n360:outbox:v1:${id}`), attemptId);
  expect(JSON.parse(stored!).pending.length).toBe(1);

  // 3. Reconnect: the outbox syncs and the server confirms.
  await context.setOffline(false);
  await expect(page.getByTestId("save-status")).toHaveText("Saved on server", { timeout: 20_000 });
  await expect(page.getByTestId("connection-banner")).toHaveAttribute("data-state", /online|reconnected/);

  // 4. Server state is authoritative and the deadline did not move.
  const after = await (await request.get(`${API}/attempts/${attemptId}`, { headers: auth })).json();
  const q2 = after.questions.find((q: any) => q.question_text === "Largest planet?");
  const jupiter = q2.options.find((o: any) => o.option_text === "Jupiter").option_id;
  const row = after.responses.find((r: any) => r.question_id === q2.question_id);
  expect(row.selected_option_id).toBe(jupiter);
  expect(after.deadline_at).toBe(before.deadline_at);

  // 5. Refresh restores confirmed progress from the server.
  await page.reload();
  await expect(page.getByLabel(/Question 1: answered, saved/)).toBeVisible();
  await expect(page.getByLabel(/Question 2: answered, saved/)).toBeVisible();

  // 6. Mark for review, written answer, then submit with receipt.
  await page.getByLabel(/Question 3:/).click();
  await page.getByLabel("Answer for question 3").fill("Fibre cuts and power failures at the ISP.");
  await page.getByRole("button", { name: /Mark for review/ }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved on server", { timeout: 20_000 });
  await page.getByRole("button", { name: /Review & submit/ }).click();
  await expect(page.getByRole("dialog")).toContainText("3 of 3 answers saved on the server");
  await page.getByRole("button", { name: "Submit now" }).click();
  await expect(page.getByText("Submission received")).toBeVisible();
  await expect(page.getByText("3 of 3")).toBeVisible();
});

test("5.3 change made offline after the server deadline is not counted", async ({ page, context, request }) => {
  const { exam, candidate, candidateEmail, password } = await setupExam(request);
  const auth = { Authorization: `Bearer ${candidate.access_token}` };
  const start = await request.post(`${API}/attempts/start`, { headers: auth, data: { exam_id: exam.id, roll_number: "UAT-LATE" } });
  const attempt = await start.json();
  await signInAs(page, candidateEmail, password);
  await page.goto(`/exam?attempt_id=${attempt.attempt_id}`);
  await page.getByText("Islamabad", { exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved on server");

  await context.setOffline(true);
  await page.getByText("Lahore", { exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Pending sync");

  // Simulate the official deadline passing on the server while the candidate is offline.
  const expire = await request.post(`${API}/attempts/${attempt.attempt_id}/submit`, { headers: auth, data: { generate_report: false } });
  expect(expire.ok()).toBeTruthy();
  await context.setOffline(false);

  const final = await (await request.get(`${API}/attempts/${attempt.attempt_id}`, { headers: auth })).json();
  const q1 = final.questions.find((q: any) => q.question_text === "Capital of Pakistan?");
  const islamabad = q1.options.find((o: any) => o.option_text === "Islamabad").option_id;
  await expect(page.getByText(/Submission received|did not reach the server|no longer active/).first()).toBeVisible({ timeout: 25_000 });
  const finalRow = (await (await request.get(`${API}/attempts/${attempt.attempt_id}`, { headers: auth })).json()).responses.find(
    (r: any) => r.question_id === q1.question_id,
  );
  expect(final.status).toBe("submitted");
  expect(finalRow.selected_option_id).toBe(islamabad);
});

test("4.7/4.8 scratchpad stays local and separate from answers; display preferences persist", async ({ page, request }) => {
  const { exam, candidate, candidateEmail, password } = await setupExam(request);
  const auth = { Authorization: `Bearer ${candidate.access_token}` };
  const attempt = await (await request.post(`${API}/attempts/start`, { headers: auth, data: { exam_id: exam.id, roll_number: "UAT-PAD" } })).json();
  const note = `rough-work-${Date.now()}`;
  const leaked: string[] = [];
  page.on("request", (req) => {
    if ((req.postData() ?? "").includes(note) || req.url().includes(note)) leaked.push(req.url());
  });
  await signInAs(page, candidateEmail, password);
  await page.goto(`/exam?attempt_id=${attempt.attempt_id}`);
  await page.getByText("Islamabad", { exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved on server");

  await page.getByRole("button", { name: "Scratchpad" }).click();
  await page.getByLabel("Rough work").fill(note);
  await page.getByLabel("Rough work").blur();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Display/ }).click();
  await page.getByRole("button", { name: "125%" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-text-scale", "125");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-text-scale", "125");
  await page.getByRole("button", { name: "Scratchpad" }).click();
  await expect(page.getByLabel("Rough work")).toHaveValue(note);

  const server = await (await request.get(`${API}/attempts/${attempt.attempt_id}`, { headers: auth })).json();
  expect(JSON.stringify(server)).not.toContain(note);
  expect(leaked, "scratchpad text never sent over the network").toEqual([]);
});

test("5.3 a network failure while checking the session does not sign the candidate out", async ({ page, request }) => {
  const { candidateEmail, password } = await setupExam(request);
  await signInAs(page, candidateEmail, password);
  await page.route("**/auth/me", (route) => route.abort("internetdisconnected"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "My Exams" })).toBeVisible();
  await expect(page).toHaveURL(/\/candidate/);
  const stored = await page.evaluate(() => window.localStorage.getItem("Nigran 360_auth"));
  expect(stored).not.toBeNull();
});
