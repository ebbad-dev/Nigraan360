import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/common/GlassCard";
import { GlowButton } from "@/components/common/GlowButton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSkeleton } from "@/components/common/States";
import { useCandidateDashboard, useCandidateResults, useCandidateAnnouncements, useStartAttempt } from "@/lib/queries";
import { Calendar, Clock, FileText, Megaphone, Award, BookOpen, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export const Route = createFileRoute("/candidate")({
  head: () => ({
    meta: [
      { title: "My Exams · Nigran 360" },
      { name: "description", content: "Candidate exam dashboard for Nigran 360." },
    ],
  }),
  component: CandidatePage,
});

function lifecycleColor(lc: string) {
  if (lc === "upcoming") return "bg-blue-500/20 text-blue-300";
  if (lc === "open") return "bg-green-500/20 text-green-300";
  if (lc === "closed" || lc === "expired") return "bg-zinc-500/20 text-zinc-400";
  if (lc === "results_available") return "bg-purple-500/20 text-purple-300";
  return "bg-zinc-500/20 text-zinc-400";
}

function lifecycleLabel(lc: string) {
  if (lc === "upcoming") return "Upcoming";
  if (lc === "open") return "Open — Take Exam";
  if (lc === "closed") return "Closed";
  if (lc === "expired") return "Expired";
  if (lc === "results_available") return "Results Available";
  return lc;
}

function CandidatePage() {
  const navigate = useNavigate();
  const dashboard = useCandidateDashboard();
  const results = useCandidateResults();
  const announcements = useCandidateAnnouncements();
  const startAttempt = useStartAttempt();
  const [joining, setJoining] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [activeTab, setActiveTab] = useState<"exams" | "results" | "announcements">("exams");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const exams: any[] = dashboard.data?.assigned_exams ?? [];
  const resultList: any[] = results.data ?? [];
  const announcementList: any[] = announcements.data ?? [];

  async function handleJoinByCode() {
    if (!joinCode.trim()) return;
    setJoinError("");
    try {
      const res: any = await api.joinExamByCode(joinCode.trim());
      if (res?.attempt_id) {
        navigate({ to: "/exam", search: { attempt_id: res.attempt_id } });
      }
    } catch (err: any) {
      setJoinError(err.message || "Invalid code or not eligible.");
    }
  }

  async function handleStartExam(examId: string, assignmentId?: string) {
    setJoining(examId);
    try {
      const attempt = await startAttempt.mutateAsync({
        exam_id: examId,
        roll_number: "",
        session_id: "",
      });
      if (attempt?.attempt_id) {
        navigate({ to: "/exam", search: { attempt_id: attempt.attempt_id } });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setJoining(null);
    }
  }

  async function handleDownloadReport(attemptId: string) {
    setDownloadingId(attemptId);
    try {
      await api.downloadAcademicReport(attemptId);
    } catch (err: any) {
      console.error(err);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Exams</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Assigned examinations, results and announcements</p>
          </div>
          <div className="flex gap-2">
            <input
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter exam code…"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
            />
            <GlowButton onClick={handleJoinByCode} className="text-xs px-3 py-1.5">Join by Code</GlowButton>
          </div>
        </div>
        {joinError && <p className="text-sm text-destructive">{joinError}</p>}

        {/* Stats row */}
        {dashboard.data && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Assigned", value: exams.length, icon: BookOpen },
              { label: "Results Available", value: exams.filter((e: any) => e.lifecycle === "results_available").length, icon: Award },
              { label: "Announcements", value: announcementList.length, icon: Megaphone },
            ].map(({ label, value, icon: Icon }) => (
              <GlassCard key={label} className="p-4 flex items-center gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xl font-bold text-foreground">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["exams", "results", "announcements"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 text-sm font-medium capitalize transition-colors",
                activeTab === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "exams" ? "My Exams" : tab === "results" ? "My Results" : "Announcements"}
              {tab === "announcements" && announcementList.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {announcementList.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Exams tab */}
        {activeTab === "exams" && (
          <div className="space-y-3">
            {dashboard.isLoading && <LoadingSkeleton />}
            {!dashboard.isLoading && exams.length === 0 && (
              <GlassCard className="p-8 text-center text-muted-foreground">
                No exams assigned yet. Use an exam code to join one.
              </GlassCard>
            )}
            {exams.map((exam: any) => (
              <GlassCard key={exam.exam_id || exam.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{exam.title}</h3>
                      <span className="text-xs text-muted-foreground font-mono">{exam.exam_code}</span>
                      <span className={cn("text-xs rounded-full px-2 py-0.5 font-medium", lifecycleColor(exam.lifecycle))}>
                        {lifecycleLabel(exam.lifecycle)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{exam.description}</p>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      {exam.duration_minutes && (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{exam.duration_minutes} min</span>
                      )}
                      {exam.start_time && (
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(exam.start_time).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {exam.lifecycle === "open" && (
                      <GlowButton
                        onClick={() => handleStartExam(exam.exam_id || exam.id, exam.assignment_id)}
                        disabled={joining === (exam.exam_id || exam.id)}
                        className="text-xs px-3 py-1.5"
                      >
                        {joining === (exam.exam_id || exam.id) ? "Starting…" : "Take Exam"}
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </GlowButton>
                    )}
                    {exam.active_attempt_id && (
                      <GlowButton
                        onClick={() => navigate({ to: "/exam", search: { attempt_id: exam.active_attempt_id } })}
                        className="text-xs px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30"
                      >
                        Resume Exam
                      </GlowButton>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Results tab */}
        {activeTab === "results" && (
          <div className="space-y-3">
            {results.isLoading && <LoadingSkeleton />}
            {!results.isLoading && resultList.length === 0 && (
              <GlassCard className="p-8 text-center text-muted-foreground">No results published yet.</GlassCard>
            )}
            {resultList.map((r: any) => (
              <GlassCard key={r.attempt_id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{r.exam_title}</h3>
                      <span className="text-xs font-mono text-muted-foreground">{r.exam_code}</span>
                    </div>
                    <div className="flex gap-4 mt-1 text-sm">
                      <span className="text-foreground font-bold">
                        {r.score} / {r.max_score}
                        {r.max_score > 0 && (
                          <span className="text-muted-foreground font-normal ml-1">
                            ({Math.round((r.score / r.max_score) * 100)}%)
                          </span>
                        )}
                      </span>
                      {r.grading_status === "graded" && (
                        <span className="text-green-400 text-xs flex items-center gap-1">
                          <Award className="h-3 w-3" /> Graded
                        </span>
                      )}
                    </div>
                  </div>
                  <GlowButton
                    onClick={() => handleDownloadReport(r.attempt_id)}
                    disabled={downloadingId === r.attempt_id}
                    className="text-xs px-3 py-1.5"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    {downloadingId === r.attempt_id ? "Downloading…" : "Download Report"}
                  </GlowButton>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Announcements tab */}
        {activeTab === "announcements" && (
          <div className="space-y-3">
            {announcements.isLoading && <LoadingSkeleton />}
            {!announcements.isLoading && announcementList.length === 0 && (
              <GlassCard className="p-8 text-center text-muted-foreground">No announcements.</GlassCard>
            )}
            {announcementList.map((a: any) => (
              <GlassCard key={a.announcement_id} className="p-4">
                <div className="flex items-start gap-3">
                  <Megaphone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-foreground">{a.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {a.exam_title && <span className="font-medium">{a.exam_title} · </span>}
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
