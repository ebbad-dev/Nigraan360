import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5071";
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@nigran360.demo", password: process.env.E2E_ADMIN_PASSWORD ?? "Nigran360!Admin" };
const EXAMINER = { email: process.env.E2E_EXAMINER_EMAIL ?? "examiner@nigran360.demo", password: process.env.E2E_EXAMINER_PASSWORD ?? "Nigran360!Examiner" };

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function uiLogin(page: Page, email: string, password: string, landing: RegExp) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: /Sign in securely/ }).click();
  await expect(page).toHaveURL(landing);
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/Failed to load resource|ERR_CONNECTION|camera|getUserMedia/i.test(msg.text())) errors.push(msg.text());
  });
  return errors;
}

/** Exam with MCQ + multi-select + written, one submitted candidate attempt awaiting written grading. */
async function submittedExam(request: APIRequestContext) {
  const tag = Math.random().toString(36).slice(2, 8);
  const admin = await apiLogin(request, ADMIN.email, ADMIN.password);
  const email = `e2e-role-${tag}@nigran360.test`;
  const password = `Role!${tag}Pass2026`;
  await request.post(`${API}/admin/users`, {
    headers: { Authorization: `Bearer ${admin.access_token}` },
    data: { email, full_name: `Role Candidate ${tag}`, role: "student", password },
  });
  const ex = await apiLogin(request, EXAMINER.email, EXAMINER.password);
  const h = { Authorization: `Bearer ${ex.access_token}` };
  const now = Date.now();
  const exam = await (
    await request.post(`${API}/exams`, {
      headers: h,
      data: { exam_code: `RL${tag.toUpperCase()}`, title: `Roles UAT ${tag}`, duration_minutes: 30, total_marks: 0, status: "draft",
        start_time: new Date(now - 300_000).toISOString(), end_time: new Date(now + 7_200_000).toISOString() },
    })
  ).json();
  const add = (data: object) => request.post(`${API}/exams/${exam.id}/questions`, { headers: h, data });
  await add({ question_text: "2 + 2 = ?", question_type: "mcq", marks: 2, sort_order: 0,
    options: [{ option_text: "3", is_correct: false }, { option_text: "4", is_correct: true }] });
  await add({ question_text: "Pick the even numbers", question_type: "multiple_select", marks: 2, sort_order: 1, marking_scheme: "all_or_nothing",
    options: [{ option_text: "2", is_correct: true }, { option_text: "3", is_correct: false }, { option_text: "6", is_correct: true }] });
  await add({ question_text: "Explain caching in one sentence.", question_type: "written", marks: 4, sort_order: 2 });
  expect((await request.post(`${API}/exams/${exam.id}/publish`, { headers: h })).ok()).toBeTruthy();
  await request.post(`${API}/exams/${exam.id}/assignments`, { headers: h, data: { student_email: email } });
  const cand = await apiLogin(request, email, password);
  const ch = { Authorization: `Bearer ${cand.access_token}` };
  const attempt = await (await request.post(`${API}/attempts/start`, { headers: ch, data: { exam_id: exam.id, roll_number: "ROLE-1" } })).json();
  const q = Object.fromEntries(attempt.questions.map((x: any) => [x.question_type, x]));
  const opt = (question: any, text: string) => question.options.find((o: any) => o.option_text === text).option_id;
  const save = (data: object) => request.post(`${API}/attempts/${attempt.attempt_id}/responses`, { headers: ch, data });
  await save({ question_id: q.mcq.question_id, selected_option_id: opt(q.mcq, "4"), client_seq: 1, mutation_id: `${tag}-1` });
  await save({ question_id: q.multiple_select.question_id, selected_option_ids: [opt(q.multiple_select, "2"), opt(q.multiple_select, "6")], client_seq: 2, mutation_id: `${tag}-2` });
  await save({ question_id: q.written.question_id, response_text: "Caching keeps recent results close to avoid recomputation.", client_seq: 3, mutation_id: `${tag}-3` });
  await request.post(`${API}/attempts/${attempt.attempt_id}/submit`, { headers: ch, data: { generate_report: false } });
  return { exam, email, password, attemptId: attempt.attempt_id };
}

test("examiner grades, publishes and reviews analytics; candidate sees only own published result", async ({ page, request, browser }) => {
  const { exam, email, password } = await submittedExam(request);
  const errors = trackErrors(page);
  await uiLogin(page, EXAMINER.email, EXAMINER.password, /\/instructor/);

  await page.goto(`/exam-results/${exam.id}`);
  await expect(page.getByRole("heading", { name: exam.title })).toBeVisible();
  await expect(page.getByText("Not published")).toBeVisible();
  await expect(page.getByRole("button", { name: /publish/i })).toBeDisabled();

  await page.getByRole("tab", { name: /grading/ }).click();
  await expect(page.getByText("Explain caching in one sentence.")).toBeVisible();
  await page.getByLabel(/Marks \(max 4\)/).fill("7");
  await page.getByRole("button", { name: "Save grade" }).click();
  await expect(page.getByText("Enter a whole number from 0 to 4.")).toBeVisible();
  await page.getByLabel(/Marks \(max 4\)/).fill("3");
  await page.getByRole("button", { name: "Save grade" }).click();
  await expect(page.getByText(/Grade saved on the server/)).toBeVisible();

  await page.getByRole("tab", { name: /results/ }).click();
  await expect(page.getByRole("cell", { name: "7 / 8" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Review complete — publish/ }).click();
  await expect(page.getByText(/^Published/)).toBeVisible();

  await page.getByRole("tab", { name: /analytics/ }).click();
  await expect(page.getByText(/Sample: 1 submitted attempt/)).toBeVisible();
  await expect(page.getByText("Pick the even numbers")).toBeVisible();

  await page.getByRole("tab", { name: /monitor/ }).click();
  await expect(page.getByText(/not conclusive evidence of misconduct/)).toBeVisible();
  await expect(page.getByText("3/3 answered")).toBeVisible();

  await page.getByRole("tab", { name: /announcements/ }).click();
  await page.getByLabel("Announcement title").fill("Results released");
  await page.getByLabel("Announcement message").fill("Please review your scores and feedback.");
  await page.getByRole("button", { name: "Post announcement" }).click();
  await expect(page.getByText("Please review your scores and feedback.")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);

  const candidateContext = await browser.newContext();
  const cpage = await candidateContext.newPage();
  const cerrors = trackErrors(cpage);
  await uiLogin(cpage, email, password, /\/candidate/);
  await cpage.getByRole("tab", { name: "My Results" }).click();
  await expect(cpage.getByText(exam.title)).toBeVisible();
  await expect(cpage.getByText("7 / 8")).toBeVisible();
  await expect(cpage.getByRole("button", { name: /Verified PDF report/ })).toBeVisible();
  await cpage.getByRole("tab", { name: /Announcements/ }).click();
  await expect(cpage.getByText("Results released")).toBeVisible();
  expect(cerrors, cerrors.join("\n")).toEqual([]);
  await candidateContext.close();
});

test("examiner builds questions of every type in the bank and the role pages render cleanly", async ({ page }) => {
  const errors = trackErrors(page);
  await uiLogin(page, EXAMINER.email, EXAMINER.password, /\/instructor/);
  await expect(page.getByText("Question builder")).toBeVisible();

  await page.goto("/bank");
  await expect(page.getByRole("heading", { name: "Question Bank" })).toBeVisible();
  const text = `UI written question ${Date.now()}`;
  await page.getByRole("button", { name: /New question/ }).click();
  await page.getByRole("radio", { name: "Written response" }).click();
  await page.getByLabel("Question text").fill(text);
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByText(text)).toBeVisible();

  await page.getByRole("button", { name: /New question/ }).click();
  await page.getByRole("radio", { name: "Single-answer MCQ" }).click();
  await page.getByLabel("Question text").fill(`Broken MCQ ${Date.now()}`);
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: /Bulk import/ }).click();
  await page.getByLabel("Import content").fill("question_text,question_type,options,correct,marks\nBad row,mcq,only-one,A,1\n");
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText(/1 with errors/)).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("administrator sees user and role management; candidate cannot open examiner pages", async ({ page, request }) => {
  const errors = trackErrors(page);
  await uiLogin(page, ADMIN.email, ADMIN.password, /\/admin/);
  await expect(page.getByText(/examiner@nigran360.demo/).first()).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);

  const { email, password } = await submittedExam(request);
  await page.getByRole("button", { name: /Logout/ }).click();
  await uiLogin(page, email, password, /\/candidate/);
  await page.goto("/bank");
  await expect(page).toHaveURL(/\/candidate/);
});

test("candidate disputes a published result and the examiner's decision corrects the score", async ({ page, request, browser }) => {
  const { exam, email, password, attemptId } = await submittedExam(request);
  const ex = await apiLogin(request, EXAMINER.email, EXAMINER.password);
  const h = { Authorization: `Bearer ${ex.access_token}` };
  const queue = await (await request.get(`${API}/exams/${exam.id}/grading`, { headers: h })).json();
  await request.post(`${API}/responses/${queue[0].response_id}/grade`, { headers: h, data: { awarded_marks: 2 } });
  expect((await request.post(`${API}/exams/${exam.id}/results/publish`, { headers: h, data: { publish: true } })).ok()).toBeTruthy();

  await uiLogin(page, email, password, /\/candidate/);
  await page.getByRole("tab", { name: "My Results" }).click();
  await expect(page.getByText("6 / 8")).toBeVisible();
  await page.getByRole("button", { name: "Dispute result" }).click();
  await page.getByLabel("Disputed question").selectOption({ label: "Q3: Explain caching in one sentence. (2/4)" });
  await page.getByPlaceholder("Explain what you believe is wrong and why.").fill("My definition covers both locality and reuse; please re-mark.");
  await page.getByRole("button", { name: "Submit dispute" }).click();
  await expect(page.getByText(/Dispute recorded/)).toBeVisible();

  const examinerContext = await browser.newContext();
  const epage = await examinerContext.newPage();
  await uiLogin(epage, EXAMINER.email, EXAMINER.password, /\/instructor/);
  await epage.goto(`/exam-results/${exam.id}`);
  await epage.getByRole("tab", { name: "disputes" }).click();
  await expect(epage.getByText("My definition covers both locality and reuse; please re-mark.")).toBeVisible();
  await epage.getByLabel("Decision reasoning").fill("Answer meets the rubric; awarding full marks.");
  await epage.getByLabel("Revised marks for the question").fill("4");
  await epage.getByRole("button", { name: "Uphold" }).click();
  await expect(epage.getByText(/total 6 → 8/)).toBeVisible();
  await examinerContext.close();

  await page.reload();
  await page.getByRole("tab", { name: "My Results" }).click();
  await expect(page.getByText("(100%)")).toBeVisible();
  await expect(page.getByText(/score 6 → 8/)).toBeVisible();
  expect(attemptId).toBeTruthy();
});
