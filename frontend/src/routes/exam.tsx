import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/common/GlassCard";
import { GlowButton } from "@/components/common/GlowButton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSkeleton } from "@/components/common/States";
import { ConnectionBanner } from "@/components/common/ConnectionStatus";
import { qk, useAttempt, useBrowserGuardActive, useLiveRisk, useSubmitAttempt } from "@/lib/queries";
import { api } from "@/lib/api";
import { useAttemptOutbox, type AnswerPayload } from "@/lib/attempt-sync";
import { useConnection } from "@/lib/connection";
import { endpoints } from "@/config/endpoints";
import type { ExamAttempt, ExamAttemptResponse, ExamQuestion } from "@/lib/types";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  Eye,
  Flag,
  ListChecks,
  Lock,
  Loader2,
  Receipt,
  Send,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/exam")({
  validateSearch: (search: Record<string, unknown>) => ({
    attempt_id: search.attempt_id as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Examination · Nigran 360" },
      { name: "description", content: "Failure-resilient candidate examination workspace." },
    ],
  }),
  component: ExamRunnerPage,
});

type QuestionStatus = "unanswered" | "saved" | "pending" | "failed";

interface ViewAnswer {
  selected_option_id: string;
  selected_option_ids: string[];
  response_text: string;
  flagged: boolean;
}

function isBlank(question: ExamQuestion, answer: ViewAnswer) {
  if (question.question_type === "written") return !answer.response_text.trim();
  if (question.question_type === "multiple_select") return answer.selected_option_ids.length === 0;
  return !answer.selected_option_id;
}

function fromRow(row?: Partial<ExamAttemptResponse> | null): ViewAnswer {
  const ids = row?.selected_option_ids?.length ? row.selected_option_ids : row?.selected_option_id ? [row.selected_option_id] : [];
  return {
    selected_option_id: row?.selected_option_id || "",
    selected_option_ids: ids,
    response_text: row?.response_text || "",
    flagged: Boolean(row?.flagged),
  };
}

/** Server time anchored to a monotonic clock, so changing the device clock cannot move the deadline. */
function useServerClock(serverNow?: string | null) {
  const anchor = useRef<{ server: number; perf: number } | null>(null);
  useEffect(() => {
    if (serverNow) anchor.current = { server: Date.parse(serverNow), perf: performance.now() };
  }, [serverNow]);
  return useCallback(() => (anchor.current ? anchor.current.server + (performance.now() - anchor.current.perf) : Date.now()), []);
}

function ExamRunnerPage() {
  const { attempt_id = "" } = Route.useSearch();
  const attempt = useAttempt(attempt_id);

  if (!attempt_id) {
    return (
      <AppShell>
        <GlassCard className="mx-auto max-w-xl p-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-300" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">No exam attempt selected</h1>
          <p className="mt-2 text-sm text-muted-foreground">Open an examination from your dashboard.</p>
          <Link to="/candidate">
            <GlowButton className="mt-4">My exams</GlowButton>
          </Link>
        </GlassCard>
      </AppShell>
    );
  }

  if (attempt.isError && !attempt.data) {
    return (
      <AppShell>
        <GlassCard className="mx-auto max-w-xl p-6 text-center">
          <CloudOff className="mx-auto h-10 w-10 text-amber-300" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">Could not load this attempt</h1>
          <p className="mt-2 text-sm text-muted-foreground">{(attempt.error as Error)?.message}</p>
          <GlowButton className="mt-4" onClick={() => attempt.refetch()}>Retry</GlowButton>
        </GlassCard>
      </AppShell>
    );
  }

  if (!attempt.data) {
    return (
      <AppShell>
        <GlassCard className="p-6">
          <LoadingSkeleton lines={8} />
        </GlassCard>
      </AppShell>
    );
  }

  return <Workspace attempt={attempt.data} />;
}

function Workspace({ attempt }: { attempt: ExamAttempt }) {
  const qc = useQueryClient();
  const attemptId = attempt.attempt_id;
  const sandbox = attempt.attempt_type === "sandbox";
  const submittedOnServer = attempt.status !== "in_progress";
  const connection = useConnection();
  const outbox = useAttemptOutbox(attemptId, !submittedOnServer);
  const submitAttempt = useSubmitAttempt(attemptId);
  const serverClock = useServerClock(attempt.server_now);
  const sessionId = attempt.session_id || "";
  const risk = useLiveRisk(sandbox ? "" : sessionId);
  const guard = useBrowserGuardActive();
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [receipt, setReceipt] = useState<ExamAttempt | null>(null);
  const [proctorNotice, setProctorNotice] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const autoSubmitted = useRef(false);

  const questions = attempt.questions;
  const serverRows = useMemo(() => new Map(attempt.responses.map((row) => [row.question_id, row])), [attempt.responses]);

  useEffect(() => {
    const maxSeq = Math.max(0, ...attempt.responses.map((row) => Number(row.client_seq ?? 0)));
    outbox.seed(maxSeq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.responses]);

  const { pending, confirmed, failed, closed } = outbox.state;
  const pendingByKey = useMemo(() => new Map(pending.map((item) => [item.key, item])), [pending]);

  function viewFor(question: ExamQuestion): ViewAnswer {
    const server = serverRows.get(question.question_id);
    const ack = confirmed[question.question_id];
    const base = ack && Number(ack.client_seq ?? -1) >= Number(server?.client_seq ?? -1) ? fromRow(ack as Partial<ExamAttemptResponse>) : fromRow(server);
    const answerChange = pendingByKey.get(`${question.question_id}:answer`);
    const flagChange = pendingByKey.get(`${question.question_id}:flag`);
    const merged = { ...base };
    if (answerChange) {
      merged.selected_option_id = answerChange.payload.selected_option_id ?? "";
      merged.selected_option_ids = answerChange.payload.selected_option_ids ?? [];
      merged.response_text = answerChange.payload.response_text ?? "";
    }
    if (flagChange) merged.flagged = Boolean(flagChange.payload.flagged);
    return merged;
  }

  function statusFor(question: ExamQuestion): QuestionStatus {
    if (failed[question.question_id]) return "failed";
    if (pendingByKey.has(`${question.question_id}:answer`) || pendingByKey.has(`${question.question_id}:flag`)) return "pending";
    return isBlank(question, viewFor(question)) ? "unanswered" : "saved";
  }

  const writeTimer = useRef<number | null>(null);
  function change(question: ExamQuestion, payload: AnswerPayload, kind: "answer" | "flag" = "answer") {
    if (submittedOnServer || closed || remainingMs <= 0) return;
    outbox.enqueue(question.question_id, kind, payload);
    if (writeTimer.current) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => void outbox.flush(), question.question_type === "written" && kind === "answer" ? 800 : 50);
  }

  // Timer: server deadline minus server time (monotonic-anchored). Going offline never adds time.
  const [nowMs, setNowMs] = useState(() => serverClock());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(serverClock()), 500);
    return () => window.clearInterval(id);
  }, [serverClock]);
  const deadlineMs = attempt.deadline_at ? Date.parse(attempt.deadline_at) : Number.POSITIVE_INFINITY;
  const remainingMs = Math.max(0, deadlineMs - nowMs);

  async function doSubmit() {
    setSubmitError("");
    await outbox.flush();
    try {
      const result = await submitAttempt.mutateAsync();
      if (!sandbox) await api.stopProctor().catch(() => undefined);
      setReceipt(result);
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: qk.candidateDashboard });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit. Your saved answers are safe on the server; try again.");
    }
  }

  useEffect(() => {
    if (remainingMs > 0 || submittedOnServer || autoSubmitted.current || !Number.isFinite(deadlineMs)) return;
    autoSubmitted.current = true;
    void doSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, submittedOnServer]);

  useEffect(() => {
    if (!sessionId || sandbox || submittedOnServer || typeof window === "undefined") return;
    let cancelled = false;
    api
      .startProctor({ session_id: sessionId, student_id: attempt.user_id, exam_code: attempt.exam.exam_code || attempt.exam_id })
      .then(() => api.issueBrowserGuardToken(sessionId))
      .then(({ token, session_id }) => {
        if (!cancelled) window.postMessage({ type: "Nigran 360_BROWSER_GUARD_TOKEN", token, session_id }, window.location.origin);
      })
      .catch(() => setProctorNotice("Camera monitoring is unavailable on this device; browser activity is still recorded."));
    return () => {
      cancelled = true;
      window.postMessage({ type: "Nigran 360_BROWSER_GUARD_CLEAR" }, window.location.origin);
    };
  }, [sessionId, sandbox, submittedOnServer, attempt.user_id, attempt.exam.exam_code, attempt.exam_id]);

  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    update();
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useBrowserEventFallback(sandbox || submittedOnServer ? "" : sessionId);

  if (receipt || submittedOnServer) {
    const final = receipt ?? attempt;
    const answeredOnServer = final.responses.filter((row) => {
      const q = questions.find((item) => item.question_id === row.question_id);
      return q ? !isBlank(q, fromRow(row)) : false;
    }).length;
    return (
      <AppShell>
        <GlassCard className="mx-auto max-w-xl space-y-4 p-6" role="status">
          <div className="flex items-center gap-3">
            <Receipt className="h-8 w-8 text-emerald-300" aria-hidden />
            <div>
              <h1 className="text-lg font-semibold">{sandbox ? "Sandbox preview finished" : "Submission received"}</h1>
              <p className="text-sm text-muted-foreground">{final.exam.title}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Attempt ID</dt><dd className="font-mono text-xs">{final.attempt_id}</dd>
            <dt className="text-muted-foreground">Submitted (server time)</dt><dd>{final.submitted_at ? new Date(final.submitted_at).toLocaleString() : "—"}</dd>
            <dt className="text-muted-foreground">Answers held by the server</dt><dd>{answeredOnServer} of {questions.length}</dd>
          </dl>
          {outbox.state.discarded > 0 && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-200">
              {outbox.state.discarded} change(s) made on this device did not reach the server before the deadline and were not counted.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {sandbox
              ? "Sandbox attempts are isolated: they never appear in results, analytics or grading."
              : "Only answers received by the server before the deadline count. Results appear once your examiner publishes them."}
          </p>
          <Link to={sandbox ? "/instructor" : "/candidate"} search={sandbox ? { risk: undefined } : undefined}>
            <GlowButton className="w-full">{sandbox ? "Back to examiner dashboard" : "Back to my exams"}</GlowButton>
          </Link>
        </GlassCard>
      </AppShell>
    );
  }

  const activeQuestion = questions[Math.min(activeIndex, Math.max(0, questions.length - 1))];
  const counts = questions.reduce(
    (acc, q) => {
      const status = statusFor(q);
      acc[status] += 1;
      if (viewFor(q).flagged) acc.flagged += 1;
      return acc;
    },
    { unanswered: 0, saved: 0, pending: 0, failed: 0, flagged: 0 },
  );
  const locked = Boolean(closed) || remainingMs <= 0;

  return (
    <AppShell>
      {sandbox && (
        <div className="mb-3 rounded-xl border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-sm text-violet-100" role="note">
          SANDBOX PREVIEW — this attempt is isolated and will not affect results, analytics or candidate records.
        </div>
      )}
      <ConnectionBanner state={connection.state} pending={pending.length} flushing={outbox.state.flushing} lastSyncedAt={outbox.state.lastSyncedAt} onRetry={() => { void connection.recheck(); void outbox.flush(); }} />
      {closed && (
        <div className="mb-3 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm text-red-100" role="alert">
          {outbox.state.closedMessage}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[260px_1fr_280px]">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">Questions</h2>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 xl:grid-cols-4" role="list">
            {questions.map((q, index) => {
              const status = statusFor(q);
              const flagged = viewFor(q).flagged;
              return (
                <button
                  key={q.question_id}
                  type="button"
                  role="listitem"
                  onClick={() => setActiveIndex(index)}
                  aria-current={index === activeIndex}
                  aria-label={`Question ${index + 1}: ${status === "saved" ? "answered, saved" : status === "pending" ? "pending sync" : status === "failed" ? "save failed" : "not answered"}${flagged ? ", marked for review" : ""}`}
                  className={cn(
                    "relative grid h-10 place-items-center rounded-lg border text-sm font-semibold transition",
                    index === activeIndex && "ring-2 ring-primary",
                    status === "saved" && "border-emerald-400/50 bg-emerald-500/20 text-emerald-100",
                    status === "pending" && "border-amber-400/60 bg-amber-500/20 text-amber-100",
                    status === "failed" && "border-red-400/60 bg-red-500/20 text-red-100",
                    status === "unanswered" && "border-white/15 bg-white/[0.03] text-muted-foreground",
                  )}
                >
                  {index + 1}
                  {flagged && <Flag className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-sky-400 text-sky-400" aria-hidden />}
                </button>
              );
            })}
          </div>
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded bg-emerald-500/60" />Saved on server ({counts.saved})</li>
            <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded bg-amber-500/60" />Pending sync ({counts.pending})</li>
            <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded bg-red-500/60" />Save failed ({counts.failed})</li>
            <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded border border-white/30" />Not answered ({counts.unanswered})</li>
            <li><Flag className="mr-1 inline h-3 w-3 text-sky-400" aria-hidden />Marked for review ({counts.flagged})</li>
          </ul>
        </GlassCard>

        <GlassCard className="min-h-[70vh] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{attempt.exam.exam_code || attempt.exam_id}</div>
              <h1 className="mt-1 text-2xl font-semibold">{attempt.exam.title}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge label={`Roll ${attempt.roll_number}`} status="info" />
                <StatusBadge label={`${counts.saved}/${questions.length} saved`} status={counts.saved === questions.length ? "ok" : "warning"} />
              </div>
            </div>
            <div className={cn("flex items-center gap-2 rounded-2xl border px-4 py-3", remainingMs < 5 * 60_000 ? "border-red-400/50 bg-red-500/10" : "border-white/10 bg-white/[0.04]")} aria-live="polite">
              <Clock className="h-4 w-4 text-primary" aria-hidden />
              <span className="font-mono text-lg" data-testid="exam-timer">
                {Number.isFinite(deadlineMs) ? formatRemaining(remainingMs) : "--:--"}
              </span>
            </div>
          </div>

          {!activeQuestion ? (
            <div className="grid min-h-[360px] place-items-center text-sm text-muted-foreground">No questions have been added to this exam.</div>
          ) : (
            <QuestionPanel
              key={activeQuestion.question_id}
              index={activeIndex}
              question={activeQuestion}
              answer={viewFor(activeQuestion)}
              status={statusFor(activeQuestion)}
              error={failed[activeQuestion.question_id]}
              locked={locked}
              onChange={(payload) => change(activeQuestion, payload)}
              onFlag={(flagged) => change(activeQuestion, { flagged }, "flag")}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="flex gap-2">
              <GlowButton size="sm" variant="ghost" disabled={activeIndex === 0} onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}>
                <ChevronLeft aria-hidden /> Previous
              </GlowButton>
              <GlowButton size="sm" variant="ghost" disabled={activeIndex >= questions.length - 1} onClick={() => setActiveIndex((i) => Math.min(questions.length - 1, i + 1))}>
                Next <ChevronRight aria-hidden />
              </GlowButton>
            </div>
            <GlowButton disabled={locked || submitAttempt.isPending || !questions.length} onClick={() => setConfirmOpen(true)}>
              <Send className="h-4 w-4" aria-hidden /> Review &amp; submit
            </GlowButton>
          </div>
          {submitError && <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 p-2 text-xs text-red-200">{submitError}</p>}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="p-4">
            <h3 className="text-sm font-semibold">How saving works</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>Every change is stored on this device first, then sent to the server.</li>
              <li><strong className="text-emerald-300">Saved on server</strong> appears only after the server confirms.</li>
              <li>If you lose connection, keep working — pending changes sync automatically when you reconnect.</li>
              <li>The timer is set by the server and keeps running while you are offline. Only answers the server receives before the deadline count.</li>
            </ul>
          </GlassCard>
          {!sandbox && (
            <GlassCard className="p-4">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" aria-hidden />
                <h3 className="text-sm font-semibold">Monitoring</h3>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <Row label="Browser monitoring" value={guard.data?.active ? "Enhanced" : "Standard"} />
                <Row label="Recorded signals" value={risk.data ? String(risk.data.score) : "0"} />
                <Row label="Fullscreen" value={fullscreen ? "Active" : "Off"} />
              </div>
              {proctorNotice && <p className="mt-2 text-xs text-muted-foreground">{proctorNotice}</p>}
              <GlowButton className="mt-3 w-full" size="sm" variant="outline" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}>
                <Lock className="h-4 w-4" aria-hidden /> Enter fullscreen
              </GlowButton>
              <p className="mt-2 text-[11px] text-muted-foreground">Signals are for human review only and are not treated as proof of misconduct.</p>
            </GlassCard>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <GlassCard strong className="w-full max-w-md space-y-4 p-6">
            <h2 id="submit-title" className="text-lg font-semibold">Submit examination?</h2>
            <ul className="space-y-1 text-sm">
              <li>{counts.saved} of {questions.length} answers saved on the server</li>
              {counts.unanswered > 0 && <li className="text-amber-300">{counts.unanswered} question(s) not answered</li>}
              {counts.flagged > 0 && <li className="text-sky-300">{counts.flagged} question(s) marked for review</li>}
              {counts.pending > 0 && (
                <li className="flex items-start gap-1 text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {counts.pending} change(s) not yet on the server. Submitting first tries to sync them; anything that cannot be delivered will not count.
                </li>
              )}
            </ul>
            <p className="text-xs text-muted-foreground">Submission is final. You cannot change answers afterwards.</p>
            {submitError && <p role="alert" className="text-xs text-red-300">{submitError}</p>}
            <div className="flex justify-end gap-2">
              <GlowButton size="sm" variant="ghost" onClick={() => setConfirmOpen(false)}>Keep working</GlowButton>
              <GlowButton size="sm" onClick={() => void doSubmit()} disabled={submitAttempt.isPending}>
                {submitAttempt.isPending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Submitting…</> : "Submit now"}
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      )}
    </AppShell>
  );
}

function QuestionPanel({
  index,
  question,
  answer,
  status,
  error,
  locked,
  onChange,
  onFlag,
}: {
  index: number;
  question: ExamQuestion;
  answer: ViewAnswer;
  status: QuestionStatus;
  error?: string;
  locked: boolean;
  onChange: (payload: AnswerPayload) => void;
  onFlag: (flagged: boolean) => void;
}) {
  const type = question.question_type;
  return (
    <div className="py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Question {index + 1} · {question.marks} mark{question.marks === 1 ? "" : "s"} ·{" "}
          {type === "multiple_select" ? "Select all that apply" : type === "written" ? "Written answer" : "Choose one"}
        </div>
        <SaveBadge status={status} />
      </div>
      <h2 className="mt-2 whitespace-pre-wrap text-xl font-semibold leading-relaxed">{question.question_text}</h2>

      {type === "written" ? (
        <textarea
          className="mt-6 min-h-[220px] w-full rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-base focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70"
          value={answer.response_text}
          disabled={locked}
          maxLength={10000}
          aria-label={`Answer for question ${index + 1}`}
          onChange={(e) => onChange({ response_text: e.target.value })}
        />
      ) : (
        <fieldset className="mt-6 space-y-3" disabled={locked}>
          <legend className="sr-only">Options for question {index + 1}</legend>
          {question.options.map((option, optionIndex) => {
            const multi = type === "multiple_select";
            const selected = multi ? answer.selected_option_ids.includes(option.option_id) : answer.selected_option_id === option.option_id;
            return (
              <label
                key={option.option_id}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                  selected ? "border-primary/60 bg-primary/15" : "border-white/10 bg-white/[0.035] hover:bg-white/[0.07]",
                  locked && "cursor-not-allowed opacity-70",
                )}
              >
                <input
                  type={multi ? "checkbox" : "radio"}
                  name={`q-${question.question_id}`}
                  className="sr-only"
                  checked={selected}
                  onChange={() => {
                    if (multi) {
                      const next = selected
                        ? answer.selected_option_ids.filter((id) => id !== option.option_id)
                        : [...answer.selected_option_ids, option.option_id];
                      onChange({ selected_option_ids: next });
                    } else {
                      onChange({ selected_option_id: option.option_id });
                    }
                  }}
                />
                <span className={cn("grid h-8 w-8 place-items-center bg-white/5 text-xs font-semibold", multi ? "rounded-md" : "rounded-full", selected && "bg-primary text-primary-foreground")}>
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span className="flex-1">{option.option_text}</span>
                {selected && <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />}
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <GlowButton size="sm" variant={answer.flagged ? "outline" : "ghost"} disabled={locked} onClick={() => onFlag(!answer.flagged)} aria-pressed={answer.flagged}>
          <Flag className={cn("h-4 w-4", answer.flagged && "fill-sky-400 text-sky-400")} aria-hidden />
          {answer.flagged ? "Marked for review" : "Mark for review"}
        </GlowButton>
        {error && <span role="alert" className="text-xs text-red-300">Not saved: {error}</span>}
      </div>
    </div>
  );
}

function SaveBadge({ status }: { status: QuestionStatus }) {
  const map: Record<QuestionStatus, { label: string; cls: string }> = {
    saved: { label: "Saved on server", cls: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200" },
    pending: { label: "Pending sync", cls: "border-amber-400/40 bg-amber-500/15 text-amber-200" },
    failed: { label: "Save failed", cls: "border-red-400/40 bg-red-500/15 text-red-200" },
    unanswered: { label: "Not answered", cls: "border-white/15 text-muted-foreground" },
  };
  const { label, cls } = map[status];
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs", cls)} data-testid="save-status" aria-live="polite">
      {label}
    </span>
  );
}

function formatRemaining(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function useBrowserEventFallback(sessionId: string) {
  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;
    let lastAwayAt = 0;
    let lastDevtoolsAt = 0;
    const post = (endpoint: string, payload: Record<string, unknown>) => {
      api.postBrowserSignal(endpoint, { ...payload, session_id: sessionId }).catch(() => undefined);
    };
    const away = () => {
      const now = Date.now();
      if (now - lastAwayAt < 1500) return;
      lastAwayAt = now;
      post(endpoints.tabEvent, { direction: "away" });
    };
    // Leaving the tab fires both blur and visibilitychange; route "away" through the same
    // throttle so one tab switch is scored once, not twice.
    const visibility = () => (document.hidden ? away() : post(endpoints.tabEvent, { direction: "back" }));
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;
      const combo =
        (ctrl && ["c", "v", "x", "a", "w", "n", "t", "u"].includes(key)) ||
        (ctrl && event.shiftKey && ["i", "j"].includes(key)) ||
        event.key === "F12";
      if (!combo) return;
      post(endpoints.keyboardEvent, { combo: `${ctrl ? "Ctrl+" : ""}${event.shiftKey ? "Shift+" : ""}${event.key}` });
      if (["F12", "i", "j", "u"].includes(key)) post(endpoints.devtoolsEvent, { state: "open" });
    };
    const clipboard = (event: ClipboardEvent) => post(endpoints.clipboardEvent, { action: event.type });
    const fullscreen = () => {
      if (!document.fullscreenElement) post(endpoints.fullscreenEvent, { state: "exit" });
    };
    const devtoolsHeuristic = window.setInterval(() => {
      const open = window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160;
      if (open && Date.now() - lastDevtoolsAt > 8000) {
        lastDevtoolsAt = Date.now();
        post(endpoints.devtoolsEvent, { state: "open" });
      }
    }, 3000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", away);
    document.addEventListener("keydown", keydown);
    document.addEventListener("copy", clipboard);
    document.addEventListener("cut", clipboard);
    document.addEventListener("paste", clipboard);
    document.addEventListener("fullscreenchange", fullscreen);
    return () => {
      window.clearInterval(devtoolsHeuristic);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", away);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("copy", clipboard);
      document.removeEventListener("cut", clipboard);
      document.removeEventListener("paste", clipboard);
      document.removeEventListener("fullscreenchange", fullscreen);
    };
  }, [sessionId]);
}
