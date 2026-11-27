import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/common/GlassCard";
import { GlowButton } from "@/components/common/GlowButton";
import { LoadingSkeleton } from "@/components/common/States";
import { useCandidateDashboard, useStartAttempt } from "@/lib/queries";
import { api } from "@/lib/api";
import { DisputeForm, MyDisputes } from "@/components/disputes/Disputes";
import { cn } from "@/lib/utils";
import { Award, BookOpen, Calendar, ChevronRight, Clock, Download, Megaphone, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/candidate")({
  head: () => ({
    meta: [
      { title: "My Exams · Nigran 360" },
      { name: "description", content: "Candidate examination dashboard for Nigran 360." },
    ],
  }),
  component: CandidatePage,
});

type Group = "available" | "in_progress" | "upcoming" | "completed" | "closed";

const GROUPS: { key: Group; label: string; tone: string }[] = [
  { key: "in_progress", label: "In progress", tone: "bg-amber-500/15 text-amber-300" },
  { key: "available", label: "Available now", tone: "bg-emerald-500/15 text-emerald-300" },
  { key: "upcoming", label: "Upcoming", tone: "bg-sky-500/15 text-sky-300" },
  { key: "completed", label: "Completed", tone: "bg-violet-500/15 text-violet-300" },
  { key: "closed", label: "Closed", tone: "bg-zinc-500/15 text-zinc-400" },
];

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function CandidatePage() {
  const navigate = useNavigate();
  const dashboard = useCandidateDashboard();
  const startAttempt = useStartAttempt();
  const [tab, setTab] = useState<"exams" | "results" | "announcements">("exams");
  const [startingExam, setStartingExam] = useState<string | null>(null);
  const [rollNumber, setRollNumber] = useState("");
  const [startError, setStartError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);

  const groups: Record<Group, any[]> = dashboard.data?.groups ?? { available: [], in_progress: [], upcoming: [], completed: [], closed: [] };
  const results: any[] = dashboard.data?.results ?? [];
  const announcements: any[] = dashboard.data?.announcements ?? [];
  const totalExams = GROUPS.reduce((sum, g) => sum + (groups[g.key]?.length ?? 0), 0);

  async function beginExam(examId: string) {
    setStartError("");
    if (rollNumber.trim().length < 2) {
      setStartError("Enter your official university roll number to start.");
      return;
    }
    try {
      const attempt = await startAttempt.mutateAsync({ exam_id: examId, roll_number: rollNumber.trim(), session_id: "" });
      navigate({ to: "/exam", search: { attempt_id: attempt.attempt_id } });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Could not start the exam.");
    }
  }

  async function downloadReport(attemptId: string) {
    setDownloadError("");
    setDownloadingId(attemptId);
    try {
      await api.downloadAcademicReport(attemptId);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Report download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Exams</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your assigned examinations, published results and examiner announcements.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Assigned exams", value: totalExams, icon: BookOpen },
            { label: "Published results", value: results.filter((r) => r.published).length, icon: Award },
            { label: "Announcements", value: announcements.length, icon: Megaphone },
          ].map(({ label, value, icon: Icon }) => (
            <GlassCard key={label} className="flex items-center gap-3 p-4">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <div>
                <div className="text-xl font-bold text-foreground">{dashboard.isLoading ? "…" : value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </GlassCard>
          ))}
        </div>

        <div role="tablist" className="flex gap-1 border-b border-border">
          {(["exams", "results", "announcements"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors",
                tab === key ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "exams" ? "Examinations" : key === "results" ? "My Results" : `Announcements (${announcements.length})`}
            </button>
          ))}
        </div>

        {dashboard.isError && (
          <GlassCard className="p-4 text-sm text-destructive">
            Could not load your dashboard: {(dashboard.error as Error)?.message}
          </GlassCard>
        )}

        {tab === "exams" && (
          <div className="space-y-6">
            {dashboard.isLoading && <LoadingSkeleton />}
            {!dashboard.isLoading && totalExams === 0 && (
              <GlassCard className="p-8 text-center text-muted-foreground">
                No examinations are assigned to you yet. Your examiner enrols you before an exam opens.
              </GlassCard>
            )}
            {GROUPS.filter((g) => groups[g.key]?.length).map((g) => (
              <section key={g.key} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h2>
                {groups[g.key].map((exam: any) => (
                  <GlassCard key={exam.exam_id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-foreground">{exam.title}</h3>
                          {exam.exam_code && <span className="font-mono text-xs text-muted-foreground">{exam.exam_code}</span>}
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", g.tone)}>{g.label}</span>
                        </div>
                        {exam.instructions && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{exam.instructions}</p>}
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{exam.duration_minutes} min · {exam.total_marks} marks</span>
                          {exam.start_time && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" aria-hidden />Opens {fmt(exam.start_time)}</span>}
                          {exam.end_time && <span>Closes {fmt(exam.end_time)}</span>}
                          {exam.attempt?.submitted_at && <span>Submitted {fmt(exam.attempt.submitted_at)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {g.key === "in_progress" && exam.attempt && (
                          <GlowButton size="sm" onClick={() => navigate({ to: "/exam", search: { attempt_id: exam.attempt.attempt_id } })}>
                            Resume exam <ChevronRight className="h-3 w-3" aria-hidden />
                          </GlowButton>
                        )}
                        {g.key === "available" && startingExam !== exam.exam_id && (
                          <GlowButton size="sm" onClick={() => { setStartingExam(exam.exam_id); setStartError(""); }}>
                            <PlayCircle aria-hidden /> Start exam
                          </GlowButton>
                        )}
                      </div>
                    </div>
                    {g.key === "available" && startingExam === exam.exam_id && (
                      <form
                        className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4"
                        onSubmit={(e) => { e.preventDefault(); beginExam(exam.exam_id); }}
                      >
                        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                          Official university roll number
                          <input
                            autoFocus
                            value={rollNumber}
                            onChange={(e) => setRollNumber(e.target.value)}
                            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="e.g. FA23-BCS-001"
                          />
                        </label>
                        <GlowButton size="sm" type="submit" disabled={startAttempt.isPending}>
                          {startAttempt.isPending ? "Starting…" : "Confirm & start"}
                        </GlowButton>
                        <GlowButton size="sm" variant="ghost" type="button" onClick={() => setStartingExam(null)}>Cancel</GlowButton>
                        <Link to="/setup" className="text-xs text-primary underline">Use proctored setup instead</Link>
                        <p className="w-full text-xs text-muted-foreground">
                          The timer starts on the server when you confirm and keeps running if you disconnect.
                        </p>
                        {startError && <p role="alert" className="w-full text-sm text-destructive">{startError}</p>}
                      </form>
                    )}
                  </GlassCard>
                ))}
              </section>
            ))}
          </div>
        )}

        {tab === "results" && (
          <div className="space-y-3">
            {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
            {!dashboard.isLoading && results.length === 0 && (
              <GlassCard className="p-8 text-center text-muted-foreground">You have no submitted examinations yet.</GlassCard>
            )}
            {results.map((r) => (
              <GlassCard key={r.attempt_id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <h3 className="font-semibold text-foreground">{r.exam_title}</h3>
                  <p className="text-xs text-muted-foreground">Submitted {fmt(r.submitted_at)}</p>
                  {r.published ? (
                    <p className="mt-1 text-sm font-bold text-foreground">
                      {r.score} / {r.max_score} <span className="font-normal text-muted-foreground">({r.percentage}%)</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">{r.status_label}</p>
                  )}
                </div>
                {r.published && (
                  <div className="flex flex-wrap gap-2">
                    <GlowButton size="sm" variant="outline" onClick={() => downloadReport(r.attempt_id)} disabled={downloadingId === r.attempt_id}>
                      <Download aria-hidden /> {downloadingId === r.attempt_id ? "Preparing…" : "Verified PDF report"}
                    </GlowButton>
                    <GlowButton size="sm" variant="ghost" onClick={() => setDisputing(disputing === r.attempt_id ? null : r.attempt_id)}>
                      Dispute result
                    </GlowButton>
                  </div>
                )}
                {disputing === r.attempt_id && <DisputeForm attemptId={r.attempt_id} onClose={() => setDisputing(null)} />}
              </GlassCard>
            ))}
          </div>
        )}

        {tab === "results" && <MyDisputes />}

        {tab === "announcements" && (
          <div className="space-y-3">
            {!dashboard.isLoading && announcements.length === 0 && (
              <GlassCard className="p-8 text-center text-muted-foreground">No announcements from your examiners.</GlassCard>
            )}
            {announcements.map((a) => (
              <GlassCard key={a.announcement_id} className="flex items-start gap-3 p-4">
                <Megaphone className={cn("mt-0.5 h-4 w-4 shrink-0", a.priority === "urgent" ? "text-destructive" : "text-primary")} aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {a.title}
                    {a.priority !== "normal" && <span className="ml-2 text-xs uppercase text-amber-300">{a.priority}</span>}
                  </p>
                  <p className="text-sm text-foreground/90">{a.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{a.exam_title && `${a.exam_title} · `}{fmt(a.created_at)}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
