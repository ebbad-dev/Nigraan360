import { useState } from "react";
import { GlassCard } from "@/components/common/GlassCard";
import { GlowButton } from "@/components/common/GlowButton";
import { useAttempt, useCreateDispute, useDecideDispute, useExamDisputes, useMyDisputes } from "@/lib/queries";
import { cn } from "@/lib/utils";

const REASONS: Record<string, string> = {
  marking_error: "Marking error",
  answer_key_error: "Answer key error",
  technical_issue: "Technical issue during the exam",
  other: "Other",
};

const STATUS_CLS: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-300",
  upheld: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-zinc-500/20 text-zinc-300",
};

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export function DisputeForm({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const attempt = useAttempt(attemptId);
  const create = useCreateDispute();
  const [reason, setReason] = useState("marking_error");
  const [questionId, setQuestionId] = useState("");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const responses = new Map((attempt.data?.responses ?? []).map((row) => [row.question_id, row]));

  async function submit() {
    setError("");
    try {
      await create.mutateAsync({ attemptId, data: { reason, explanation: explanation.trim(), question_id: questionId || undefined } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the dispute.");
    }
  }

  if (done) {
    return (
      <div role="status" className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">
        Dispute recorded. Your examiner will review it; the decision appears under "My disputes".
        <button className="ml-2 underline" onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <div className="mt-3 w-full space-y-2 border-t border-border pt-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Reason
          <select className={cn(inputCls, "mt-1")} value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Question (optional)
          <select className={cn(inputCls, "mt-1")} value={questionId} onChange={(e) => setQuestionId(e.target.value)} aria-label="Disputed question">
            <option value="">Whole result</option>
            {(attempt.data?.questions ?? []).map((q, i) => (
              <option key={q.question_id} value={q.question_id}>
                Q{i + 1}: {q.question_text.slice(0, 60)} ({responses.get(q.question_id)?.awarded_marks ?? 0}/{q.marks})
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">Explanation
        <textarea className={cn(inputCls, "mt-1")} rows={3} maxLength={2000} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explain what you believe is wrong and why." />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <GlowButton size="sm" onClick={submit} disabled={create.isPending || explanation.trim().length < 10}>Submit dispute</GlowButton>
        <GlowButton size="sm" variant="ghost" onClick={onClose}>Cancel</GlowButton>
      </div>
    </div>
  );
}

export function MyDisputes() {
  const disputes = useMyDisputes();
  const rows: any[] = disputes.data ?? [];
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">My disputes</h2>
      {rows.map((d) => (
        <GlassCard key={d.dispute_id} className="space-y-1 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{d.exam_title}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs capitalize", STATUS_CLS[d.status])}>{d.status}</span>
            <span className="text-xs text-muted-foreground">{REASONS[d.reason] ?? d.reason} · filed {fmt(d.created_at)}</span>
          </div>
          <p className="text-foreground/90">{d.explanation}</p>
          {d.status !== "open" && (
            <p className="text-xs text-muted-foreground">
              Decision {fmt(d.decided_at)}: {d.decision_note}
              {d.revised_score !== null && d.revised_score !== d.original_score && ` · score ${d.original_score} → ${d.revised_score} / ${d.max_score}`}
            </p>
          )}
        </GlassCard>
      ))}
    </section>
  );
}

function DecisionRow({ dispute, examId }: { dispute: any; examId: string }) {
  const decide = useDecideDispute(examId);
  const [note, setNote] = useState("");
  const [marks, setMarks] = useState("");
  const [error, setError] = useState("");

  async function submit(decision: "upheld" | "rejected") {
    setError("");
    try {
      await decide.mutateAsync({
        disputeId: dispute.dispute_id,
        data: { decision, decision_note: note.trim(), revised_marks: decision === "upheld" && marks !== "" ? Number(marks) : null },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the decision.");
    }
  }

  return (
    <GlassCard className="space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">{dispute.student_name}</span>
        <span className="font-mono text-xs text-muted-foreground">{dispute.roll_number}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs capitalize", STATUS_CLS[dispute.status])}>{dispute.status}</span>
        <span className="text-xs text-muted-foreground">{REASONS[dispute.reason] ?? dispute.reason} · {fmt(dispute.created_at)}</span>
      </div>
      <p className="text-foreground/90">{dispute.explanation}</p>
      <p className="text-xs text-muted-foreground">
        Score when filed: {dispute.original_score}/{dispute.max_score}
        {dispute.question_id ? ` · disputed question marks: ${dispute.original_question_marks ?? 0}` : " · whole result"}
      </p>
      {dispute.status === "open" ? (
        <div className="space-y-2">
          <textarea className={inputCls} rows={2} placeholder="Decision reasoning (shared with the candidate)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Decision reasoning" />
          <div className="flex flex-wrap items-center gap-2">
            {dispute.question_id && (
              <input type="number" min={0} step={1} className={cn(inputCls, "w-40")} placeholder="Revised marks" value={marks} onChange={(e) => setMarks(e.target.value)} aria-label="Revised marks for the question" />
            )}
            <GlowButton size="sm" onClick={() => submit("upheld")} disabled={decide.isPending || note.trim().length < 5}>Uphold</GlowButton>
            <GlowButton size="sm" variant="ghost" onClick={() => submit("rejected")} disabled={decide.isPending || note.trim().length < 5}>Reject</GlowButton>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Decided {fmt(dispute.decided_at)}: {dispute.decision_note}
          {dispute.revised_score !== null && ` · total ${dispute.original_score} → ${dispute.revised_score}`}
        </p>
      )}
    </GlassCard>
  );
}

export function ExamDisputes({ examId }: { examId: string }) {
  const disputes = useExamDisputes(examId);
  const rows: any[] = disputes.data ?? [];
  if (disputes.isError) return <p role="alert" className="text-sm text-destructive">{(disputes.error as Error).message}</p>;
  if (!disputes.isLoading && !rows.length) return <GlassCard className="p-8 text-center text-muted-foreground">No disputes have been filed for this examination.</GlassCard>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Upholding with revised marks updates the candidate's published total; the original and revised scores stay on record.</p>
      {rows.map((d) => <DecisionRow key={d.dispute_id} dispute={d} examId={examId} />)}
    </div>
  );
}
