import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/common/GlassCard";
import { GlowButton } from "@/components/common/GlowButton";
import { LoadingSkeleton } from "@/components/common/States";
import {
  useCreateAnnouncement,
  useExamAnalytics,
  useExamAnnouncements,
  useExamResults,
  useGradeResponse,
  useGradingQueue,
  useLiveMonitor,
  usePublishExamResults,
  useWithdrawAnnouncement,
} from "@/lib/queries";
import { api } from "@/lib/api";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertCircle, ArrowLeft, CheckCircle2, Download, Megaphone, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/exam-results/$examId")({
  head: () => ({ meta: [{ title: "Results & Analytics · Nigran 360" }] }),
  component: ExamResultsPage,
});

type Tab = "results" | "grading" | "analytics" | "monitor" | "announcements";

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function pct(value?: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function ExamResultsPage() {
  const { examId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("results");
  const results = useExamResults(examId);
  const title = results.data?.exam?.title ?? "Examination";

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <Link to="/instructor" search={{ risk: undefined }} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" aria-hidden /> Examiner dashboard
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {results.data?.exam?.exam_code && <span className="font-mono">{results.data.exam.exam_code} · </span>}
            Results, grading, analytics, live monitoring and announcements
          </p>
        </div>
        <div role="tablist" className="flex flex-wrap gap-1 border-b border-border">
          {(["results", "grading", "analytics", "monitor", "announcements"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "px-4 py-2 text-sm font-medium capitalize transition-colors",
                tab === key ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "grading" && results.data?.pending_manual ? `grading (${results.data.pending_manual})` : key}
            </button>
          ))}
        </div>
        {tab === "results" && <ResultsTab examId={examId} />}
        {tab === "grading" && <GradingTab examId={examId} />}
        {tab === "analytics" && <AnalyticsTab examId={examId} />}
        {tab === "monitor" && <MonitorTab examId={examId} />}
        {tab === "announcements" && <AnnouncementsTab examId={examId} />}
      </div>
    </AppShell>
  );
}

function ResultsTab({ examId }: { examId: string }) {
  const results = useExamResults(examId);
  const publish = usePublishExamResults(examId);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  if (results.isLoading) return <LoadingSkeleton />;
  if (results.isError) return <p role="alert" className="text-sm text-destructive">{(results.error as Error).message}</p>;
  const data = results.data;
  const s = data.summary;
  const distribution = Object.entries(s.distribution ?? {}).map(([band, count]) => ({ band, count }));

  async function toggle(next: boolean) {
    setError("");
    if (next && !window.confirm("Publish results? Candidates will immediately see their own scores.")) return;
    try {
      await publish.mutateAsync(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publication failed.");
    }
  }

  async function report(attemptId: string) {
    setError("");
    setDownloading(attemptId);
    try {
      await api.downloadAcademicReport(attemptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm">
          {data.published ? (
            <><CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden /><span className="text-emerald-300">Published {fmt(data.published_at)}</span></>
          ) : (
            <><AlertCircle className="h-4 w-4 text-amber-400" aria-hidden /><span className="text-amber-300">Not published — candidates cannot see scores</span></>
          )}
          {data.pending_manual > 0 && <span className="text-muted-foreground">· {data.pending_manual} attempt(s) awaiting written grading</span>}
        </div>
        {data.published ? (
          <GlowButton size="sm" variant="ghost" onClick={() => toggle(false)} disabled={publish.isPending}>Unpublish</GlowButton>
        ) : (
          <GlowButton size="sm" onClick={() => toggle(true)} disabled={!data.can_publish || publish.isPending}>Review complete — publish</GlowButton>
        )}
      </GlassCard>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Submitted", `${s.submitted} / ${s.assigned}`],
          ["Average", s.average ?? "—"],
          ["Median", s.median ?? "—"],
          ["Highest", s.highest ?? "—"],
          ["Lowest", s.lowest ?? "—"],
          ["Pass rate (≥50%)", pct(s.pass_rate)],
        ].map(([label, value]) => (
          <GlassCard key={label as string} className="p-3">
            <div className="text-lg font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </GlassCard>
        ))}
      </div>

      {s.submitted > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Score distribution (% of {s.max_score} marks)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution}>
                <XAxis dataKey="band" stroke="currentColor" fontSize={12} />
                <YAxis allowDecimals={false} stroke="currentColor" fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary, 250 80% 65%))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-3">Candidate</th><th className="p-3">Roll no.</th><th className="p-3">Submitted</th>
              <th className="p-3">Score</th><th className="p-3">Grading</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {data.candidates.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No submitted attempts yet.</td></tr>
            )}
            {data.candidates.map((c: any) => (
              <tr key={c.attempt_id} className="border-b border-border/50">
                <td className="p-3 text-foreground">{c.student_name}<div className="text-xs text-muted-foreground">{c.student_email}</div></td>
                <td className="p-3 font-mono text-xs">{c.roll_number}</td>
                <td className="p-3 text-xs">{fmt(c.submitted_at)}</td>
                <td className="p-3 font-semibold">{c.score} / {c.max_score}</td>
                <td className="p-3 text-xs">{c.grading_status === "pending_manual" ? <span className="text-amber-300">Pending written grading</span> : "Graded"}</td>
                <td className="p-3">
                  {c.grading_status !== "pending_manual" && (
                    <button className="inline-flex items-center gap-1 text-xs text-primary underline" onClick={() => report(c.attempt_id)} disabled={downloading === c.attempt_id}>
                      <Download className="h-3 w-3" aria-hidden /> {downloading === c.attempt_id ? "…" : "PDF"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

function GradeRow({ item, examId }: { item: any; examId: string }) {
  const grade = useGradeResponse(examId);
  const [marks, setMarks] = useState<string>(item.grading_status === "pending_manual" ? "" : String(item.awarded_marks));
  const [feedback, setFeedback] = useState<string>(item.feedback || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError("");
    setSaved(false);
    const value = Number(marks);
    if (marks === "" || !Number.isInteger(value) || value < 0 || value > item.max_marks) {
      setError(`Enter a whole number from 0 to ${item.max_marks}.`);
      return;
    }
    try {
      await grade.mutateAsync({ responseId: item.response_id, data: { awarded_marks: value, feedback } });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grading failed.");
    }
  }

  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{item.student_name} · <span className="font-mono">{item.roll_number}</span></span>
        <span className={item.grading_status === "pending_manual" ? "text-amber-300" : "text-emerald-300"}>
          {item.grading_status === "pending_manual" ? "Awaiting grade" : `Graded ${fmt(item.graded_at)}`}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">{item.question_text}</p>
      <blockquote className="whitespace-pre-wrap rounded-lg border border-border bg-background/40 p-3 text-sm text-foreground/90">
        {item.response_text || <em className="text-muted-foreground">No answer</em>}
      </blockquote>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">Marks (max {item.max_marks})
          <input type="number" min={0} max={item.max_marks} step={1} className={cn(inputCls, "mt-1 w-24")} value={marks} onChange={(e) => setMarks(e.target.value)} />
        </label>
        <label className="min-w-[12rem] flex-1 text-xs text-muted-foreground">Feedback (optional)
          <input className={cn(inputCls, "mt-1")} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} />
        </label>
        <GlowButton size="sm" onClick={submit} disabled={grade.isPending}>{item.grading_status === "pending_manual" ? "Save grade" : "Regrade"}</GlowButton>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-300">Grade saved on the server; attempt total recalculated.</p>}
    </GlassCard>
  );
}

function GradingTab({ examId }: { examId: string }) {
  const queue = useGradingQueue(examId);
  if (queue.isLoading) return <LoadingSkeleton />;
  if (queue.isError) return <p role="alert" className="text-sm text-destructive">{(queue.error as Error).message}</p>;
  const items: any[] = queue.data ?? [];
  if (!items.length) return <GlassCard className="p-8 text-center text-muted-foreground">No written responses to grade.</GlassCard>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Objective questions are graded automatically when answers are saved. Only written responses appear here.</p>
      {items.map((item) => <GradeRow key={item.response_id} item={item} examId={examId} />)}
    </div>
  );
}

function AnalyticsTab({ examId }: { examId: string }) {
  const analytics = useExamAnalytics(examId);
  if (analytics.isLoading) return <LoadingSkeleton />;
  if (analytics.isError) return <p role="alert" className="text-sm text-destructive">{(analytics.error as Error).message}</p>;
  const data = analytics.data;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {data.note} Sample: {data.sample_size} submitted attempt(s).
        {data.small_sample && " Small sample — treat these figures as indicative only."}
      </p>
      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-3">Question</th><th className="p-3">Skipped</th><th className="p-3">Incorrect</th>
              <th className="p-3">Facility</th><th className="p-3">Observed vs set difficulty</th><th className="p-3">Common wrong answers</th>
            </tr>
          </thead>
          <tbody>
            {data.questions.map((q: any, i: number) => (
              <tr key={q.question_id} className="border-b border-border/50 align-top">
                <td className="max-w-xs p-3 text-foreground">
                  <span className="text-muted-foreground">Q{i + 1}.</span> {q.question_text}
                  <div className="text-xs text-muted-foreground">{q.question_type} · {q.marks} marks{q.category && ` · ${q.category}`}</div>
                </td>
                <td className="p-3">{q.skipped} <span className="text-xs text-muted-foreground">({pct(q.skipped_rate)})</span></td>
                <td className="p-3">{q.incorrect} <span className="text-xs text-muted-foreground">({pct(q.incorrect_rate)})</span></td>
                <td className="p-3">{q.facility_index ?? "—"}</td>
                <td className="p-3 capitalize">{q.observed_difficulty} / {q.configured_difficulty}</td>
                <td className="p-3 text-xs">
                  {q.common_wrong_options.length
                    ? q.common_wrong_options.map((o: any) => <div key={o.option_id}>{o.option_text} ×{o.count}</div>)
                    : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

function MonitorTab({ examId }: { examId: string }) {
  const monitor = useLiveMonitor(examId);
  if (monitor.isLoading) return <LoadingSkeleton />;
  if (monitor.isError) return <p role="alert" className="text-sm text-destructive">{(monitor.error as Error).message}</p>;
  const data = monitor.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[["In progress", data.summary.in_progress], ["Submitted", data.summary.submitted], ["Enrolled", data.summary.assigned]].map(([label, value]) => (
          <GlassCard key={label as string} className="p-3">
            <div className="text-lg font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </GlassCard>
        ))}
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Activity className="h-3 w-3" aria-hidden /> Refreshes automatically. {data.notice}</p>
      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-3">Candidate</th><th className="p-3">Status</th><th className="p-3">Progress</th>
              <th className="p-3">Time left</th><th className="p-3">Last save</th><th className="p-3">Signals</th>
            </tr>
          </thead>
          <tbody>
            {data.attempts.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No attempts started yet.</td></tr>}
            {data.attempts.map((a: any) => (
              <tr key={a.attempt_id} className="border-b border-border/50">
                <td className="p-3 text-foreground">{a.student_name}<div className="font-mono text-xs text-muted-foreground">{a.roll_number}</div></td>
                <td className="p-3 text-xs capitalize">{String(a.status).replace("_", " ")}</td>
                <td className="p-3 text-xs">
                  {a.answered}/{a.total_questions} answered{a.flagged ? ` · ${a.flagged} flagged` : ""}
                  <div className="mt-1 h-1.5 w-24 rounded bg-white/10"><div className="h-1.5 rounded bg-primary" style={{ width: `${a.total_questions ? (100 * a.answered) / a.total_questions : 0}%` }} /></div>
                </td>
                <td className="p-3 font-mono text-xs">{a.status === "in_progress" ? `${Math.floor(a.seconds_left / 60)}m ${a.seconds_left % 60}s` : "—"}</td>
                <td className="p-3 text-xs">{fmt(a.last_saved_at)}</td>
                <td className="p-3 text-xs">{a.incidents} event(s) · risk {a.risk_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
      <GlassCard className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Recent events (for human review)</h3>
        {data.incidents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No events recorded.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {data.incidents.map((e: any, i: number) => (
              <li key={i} className="flex flex-wrap gap-2">
                <span className="font-mono text-muted-foreground">{fmt(e.event_time)}</span>
                <span className="text-foreground">{e.student_name}</span>
                <span className="text-amber-300">{e.event_type}</span>
                {e.details && <span className="text-muted-foreground">{e.details}</span>}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

function AnnouncementsTab({ examId }: { examId: string }) {
  const list = useExamAnnouncements(examId);
  const create = useCreateAnnouncement(examId);
  const withdraw = useWithdrawAnnouncement(examId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [error, setError] = useState("");

  async function post() {
    setError("");
    try {
      await create.mutateAsync({ title: title.trim(), body: body.trim(), priority });
      setTitle("");
      setBody("");
      setPriority("normal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the announcement.");
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Megaphone className="h-4 w-4" aria-hidden /> New announcement to enrolled candidates</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
          <input className={inputCls} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Announcement title" />
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            <option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option>
          </select>
        </div>
        <textarea className={inputCls} rows={3} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} aria-label="Announcement message" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <GlowButton size="sm" onClick={post} disabled={create.isPending || title.trim().length < 2 || body.trim().length < 2}>Post announcement</GlowButton>
      </GlassCard>
      {list.isLoading && <LoadingSkeleton />}
      {(list.data ?? []).map((a: any) => (
        <GlassCard key={a.announcement_id} className={cn("flex items-start justify-between gap-3 p-4", a.withdrawn_at && "opacity-60")}>
          <div>
            <p className="text-sm font-semibold text-foreground">{a.title} <span className="ml-1 text-xs uppercase text-muted-foreground">{a.priority}</span></p>
            <p className="text-sm text-foreground/90">{a.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">{fmt(a.created_at)}{a.withdrawn_at && ` · withdrawn ${fmt(a.withdrawn_at)}`}</p>
          </div>
          {!a.withdrawn_at && (
            <button aria-label="Withdraw announcement" onClick={() => withdraw.mutate(a.announcement_id)} className="text-muted-foreground hover:text-destructive">
              <X className="h-4 w-4" />
            </button>
          )}
        </GlassCard>
      ))}
    </div>
  );
}
