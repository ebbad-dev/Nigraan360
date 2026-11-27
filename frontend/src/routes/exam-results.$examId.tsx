import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/common/GlassCard";
import { GlowButton } from "@/components/common/GlowButton";
import { LoadingSkeleton } from "@/components/common/States";
import {
  useExamResults,
  usePublishExamResults,
  useGradingQueue,
  useGradeResponse,
  useExamAnalytics,
  useExamAnnouncements,
  useCreateAnnouncement,
  useWithdrawAnnouncement,
  useLiveMonitor,
} from "@/lib/queries";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Award, Send, Megaphone, X, Users, Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/exam-results/$examId")({
  head: () => ({ meta: [{ title: "Exam Results · Nigran 360" }] }),
  component: ExamResultsPage,
});

function ExamResultsPage() {
  const { examId } = Route.useParams();
  const results = useExamResults(examId);
  const publish = usePublishExamResults(examId);
  const grading = useGradingQueue(examId);
  const gradeResp = useGradeResponse(examId);
  const analytics = useExamAnalytics(examId);
  const announcements = useExamAnnouncements(examId);
  const createAnn = useCreateAnnouncement(examId);
  const withdrawAnn = useWithdrawAnnouncement(examId);
  const monitor = useLiveMonitor(examId);

  const [tab, setTab] = useState<"results" | "grading" | "analytics" | "monitor" | "announcements">("results");
  const [annBody, setAnnBody] = useState("");
  const [gradingNotes, setGradingNotes] = useState<Record<string, { marks: string; feedback: string }>>({});

  const resultData = results.data;
  const rows: any[] = resultData?.attempts ?? [];
  const isPublished = !!resultData?.results_published_at;
  const gradingQueue: any[] = grading.data ?? [];
  const announcementList: any[] = announcements.data ?? [];
  const analyticsData = analytics.data;
  const monitorData = monitor.data;

  async function handlePublish(pub: boolean) {
    await publish.mutateAsync(pub);
  }

  async function handleGrade(responseId: string) {
    const notes = gradingNotes[responseId];
    if (!notes) return;
    await gradeResp.mutateAsync({
      responseId,
      data: {
        awarded_marks: parseFloat(notes.marks) || 0,
        feedback: notes.feedback,
      },
    });
  }

  async function handleAnnouncement() {
    if (!annBody.trim()) return;
    await createAnn.mutateAsync({ body: annBody });
    setAnnBody("");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {resultData?.exam_title ?? "Exam"} — Results
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{resultData?.exam_code}</p>
          </div>
          <div className="flex gap-2">
            {!isPublished ? (
              <GlowButton
                onClick={() => handlePublish(true)}
                disabled={publish.isPending}
                className="text-xs px-3 py-1.5"
              >
                <Award className="h-3 w-3 mr-1" />
                Publish Results
              </GlowButton>
            ) : (
              <GlowButton
                onClick={() => handlePublish(false)}
                disabled={publish.isPending}
                className="text-xs px-3 py-1.5 bg-zinc-700/50"
              >
                Unpublish Results
              </GlowButton>
            )}
          </div>
        </div>

        {isPublished && (
          <div className="flex items-center gap-2 rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Results published — candidates can see their scores.
          </div>
        )}
        {gradingQueue.length > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {gradingQueue.length} written answer{gradingQueue.length !== 1 ? "s" : ""} pending manual grading.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["results", "grading", "analytics", "monitor", "announcements"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium capitalize transition-colors",
                tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "announcements" ? "Announcements" :
               t === "grading" ? `Grading${gradingQueue.length ? ` (${gradingQueue.length})` : ""}` :
               t}
            </button>
          ))}
        </div>

        {/* Results tab */}
        {tab === "results" && (
          <div>
            {results.isLoading && <LoadingSkeleton />}
            {!results.isLoading && rows.length === 0 && (
              <GlassCard className="p-8 text-center text-muted-foreground">No submitted attempts yet.</GlassCard>
            )}
            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      {["Candidate", "Roll No.", "Score", "Max", "%", "Status", "Grading"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => (
                      <tr key={r.attempt_id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2 text-foreground">{r.student_name || r.user_id}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.roll_number || "—"}</td>
                        <td className="px-3 py-2 font-bold text-foreground">{r.score ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.max_score ?? "—"}</td>
                        <td className="px-3 py-2 text-foreground">
                          {r.max_score ? `${Math.round((r.score / r.max_score) * 100)}%` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "text-xs rounded-full px-2 py-0.5",
                            r.status === "submitted" ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"
                          )}>{r.status}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "text-xs",
                            r.grading_status === "graded" ? "text-green-400" :
                            r.grading_status === "pending_manual" ? "text-amber-400" : "text-muted-foreground"
                          )}>
                            {r.grading_status === "graded" ? "Graded" :
                             r.grading_status === "pending_manual" ? "Pending" : r.grading_status || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Grading tab */}
        {tab === "grading" && (
          <div className="space-y-4">
            {grading.isLoading && <LoadingSkeleton />}
            {!grading.isLoading && gradingQueue.length === 0 && (
              <GlassCard className="p-8 text-center text-muted-foreground">
                No written answers pending grading.
              </GlassCard>
            )}
            {gradingQueue.map((item: any) => (
              <GlassCard key={item.response_id} className="p-4 space-y-3">
                <div className="text-xs text-muted-foreground">
                  {item.student_name || item.user_id} · {item.roll_number} · {item.marks} marks
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Question</div>
                  <p className="text-sm text-foreground">{item.question_text}</p>
                </div>
                {item.marking_scheme && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Marking scheme</div>
                    <p className="text-xs text-muted-foreground italic">{item.marking_scheme}</p>
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Candidate answer</div>
                  <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/20 rounded p-2">{item.response_text || "(blank)"}</p>
                </div>
                <div className="flex gap-2 items-end">
                  <div>
                    <label className="text-xs text-muted-foreground">Marks (max {item.marks})</label>
                    <input
                      type="number"
                      min={0}
                      max={item.marks}
                      className="w-20 mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      value={gradingNotes[item.response_id]?.marks ?? ""}
                      onChange={(e) => setGradingNotes((n) => ({
                        ...n,
                        [item.response_id]: { ...n[item.response_id], marks: e.target.value },
                      }))}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Feedback (optional)</label>
                    <input
                      className="w-full mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      value={gradingNotes[item.response_id]?.feedback ?? ""}
                      onChange={(e) => setGradingNotes((n) => ({
                        ...n,
                        [item.response_id]: { ...n[item.response_id], feedback: e.target.value },
                      }))}
                    />
                  </div>
                  <GlowButton
                    onClick={() => handleGrade(item.response_id)}
                    disabled={gradeResp.isPending}
                    className="text-xs px-3 py-1.5"
                  >
                    Grade
                  </GlowButton>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Analytics tab */}
        {tab === "analytics" && (
          <div className="space-y-4">
            {analytics.isLoading && <LoadingSkeleton />}
            {analyticsData && (
              <>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Attempts", value: analyticsData.total_attempts },
                    { label: "Avg score", value: analyticsData.avg_score != null ? `${analyticsData.avg_score}%` : "—" },
                    { label: "Pass rate", value: analyticsData.pass_rate != null ? `${analyticsData.pass_rate}%` : "—" },
                    { label: "Highest", value: analyticsData.highest_score != null ? `${analyticsData.highest_score}%` : "—" },
                  ].map(({ label, value }) => (
                    <GlassCard key={label} className="p-4">
                      <div className="text-xl font-bold text-foreground">{value ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </GlassCard>
                  ))}
                </div>
                {analyticsData.score_distribution?.length > 0 && (
                  <GlassCard className="p-4">
                    <h3 className="text-sm font-medium text-foreground mb-3">Score Distribution</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={analyticsData.score_distribution}>
                        <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="oklch(0.7 0.18 240)" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </GlassCard>
                )}
                {analyticsData.question_analytics?.length > 0 && (
                  <GlassCard className="p-4">
                    <h3 className="text-sm font-medium text-foreground mb-3">Question Analytics</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            {["#", "Question", "Correct %", "Avg marks", "Attempts"].map((h) => (
                              <th key={h} className="text-left px-2 py-1 text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsData.question_analytics.map((q: any, i: number) => (
                            <tr key={q.question_id} className="border-t border-border">
                              <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                              <td className="px-2 py-1 text-foreground max-w-xs truncate">{q.question_text}</td>
                              <td className="px-2 py-1">{q.correct_rate != null ? `${Math.round(q.correct_rate * 100)}%` : "—"}</td>
                              <td className="px-2 py-1">{q.avg_marks != null ? q.avg_marks.toFixed(1) : "—"}</td>
                              <td className="px-2 py-1">{q.attempt_count ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </GlassCard>
                )}
              </>
            )}
            {!analytics.isLoading && !analyticsData && (
              <GlassCard className="p-8 text-center text-muted-foreground">No analytics data yet.</GlassCard>
            )}
          </div>
        )}

        {/* Monitor tab */}
        {tab === "monitor" && (
          <div className="space-y-3">
            {monitor.isLoading && <LoadingSkeleton />}
            {monitorData && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <GlassCard className="p-4">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">In progress</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground mt-1">{monitorData.in_progress_count ?? 0}</div>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      <span className="text-sm text-muted-foreground">Submitted</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground mt-1">{monitorData.submitted_count ?? 0}</div>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Not started</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground mt-1">{monitorData.not_started_count ?? 0}</div>
                  </GlassCard>
                </div>
                {monitorData.active_attempts?.length > 0 && (
                  <GlassCard className="p-4">
                    <h3 className="text-sm font-medium text-foreground mb-3">Active Candidates</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            {["Candidate", "Roll No.", "Started", "Questions Answered", "Flagged"].map((h) => (
                              <th key={h} className="text-left px-2 py-1 text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {monitorData.active_attempts.map((a: any) => (
                            <tr key={a.attempt_id} className="border-t border-border">
                              <td className="px-2 py-1 text-foreground">{a.student_name || a.user_id}</td>
                              <td className="px-2 py-1 font-mono text-muted-foreground">{a.roll_number || "—"}</td>
                              <td className="px-2 py-1 text-muted-foreground">{a.started_at ? new Date(a.started_at).toLocaleTimeString() : "—"}</td>
                              <td className="px-2 py-1">{a.answers_count ?? "—"}</td>
                              <td className="px-2 py-1">{a.flagged_count ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </GlassCard>
                )}
              </>
            )}
          </div>
        )}

        {/* Announcements tab */}
        {tab === "announcements" && (
          <div className="space-y-4">
            <GlassCard className="p-4">
              <label className="text-xs text-muted-foreground mb-2 block">Post an announcement to all candidates</label>
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Type your announcement…"
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                />
                <GlowButton
                  onClick={handleAnnouncement}
                  disabled={!annBody.trim() || createAnn.isPending}
                  className="text-xs px-3 py-1.5 self-end"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Post
                </GlowButton>
              </div>
            </GlassCard>

            {announcements.isLoading && <LoadingSkeleton />}
            {announcementList.length === 0 && !announcements.isLoading && (
              <GlassCard className="p-8 text-center text-muted-foreground">No announcements yet.</GlassCard>
            )}
            {announcementList.map((a: any) => (
              <GlassCard key={a.announcement_id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Megaphone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-foreground">{a.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => withdrawAnn.mutateAsync(a.announcement_id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
