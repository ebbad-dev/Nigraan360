import { useAttempt } from "@/lib/queries";
import { LoadingSkeleton } from "@/components/common/States";
import { cn } from "@/lib/utils";

/** Examiner review of one submitted attempt: candidate answers, answer key, marks and feedback. */
export function AnswerSheet({ attemptId }: { attemptId: string }) {
  const attempt = useAttempt(attemptId);
  if (attempt.isLoading) return <LoadingSkeleton lines={3} />;
  if (attempt.isError || !attempt.data) return <p role="alert" className="text-sm text-destructive">{(attempt.error as Error)?.message ?? "Could not load the attempt."}</p>;
  const responses = new Map(attempt.data.responses.map((row) => [row.question_id, row]));
  return (
    <ol className="space-y-3 text-sm" data-testid="answer-sheet">
      {attempt.data.questions.map((q, i) => {
        const r: any = responses.get(q.question_id);
        const chosen = new Set<string>(r?.selected_option_ids?.length ? r.selected_option_ids : r?.selected_option_id ? [r.selected_option_id] : []);
        return (
          <li key={q.question_id} className="rounded-lg border border-white/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium text-foreground">Q{i + 1}. {q.question_text}</p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {r ? `${r.awarded_marks ?? 0} / ${q.marks}` : `0 / ${q.marks} · not answered`}
                {r?.grading_status === "pending_manual" && " · awaiting grading"}
              </span>
            </div>
            {q.question_type === "written" ? (
              <p className="mt-2 whitespace-pre-wrap rounded bg-background/40 p-2 text-foreground/90">{r?.response_text || <em className="text-muted-foreground">No answer</em>}</p>
            ) : (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {q.options.map((o, oi) => (
                  <li
                    key={o.option_id}
                    className={cn(
                      "rounded px-2 py-1 text-xs",
                      chosen.has(o.option_id) && o.is_correct && "bg-emerald-500/20 text-emerald-200",
                      chosen.has(o.option_id) && !o.is_correct && "bg-red-500/20 text-red-200",
                      !chosen.has(o.option_id) && o.is_correct && "border border-emerald-400/40 text-emerald-300",
                      !chosen.has(o.option_id) && !o.is_correct && "text-muted-foreground",
                    )}
                  >
                    {String.fromCharCode(65 + oi)}. {o.option_text}
                    {chosen.has(o.option_id) && " · chosen"}
                    {o.is_correct && " · correct"}
                  </li>
                ))}
              </ul>
            )}
            {r?.feedback && <p className="mt-1 text-xs text-muted-foreground">Feedback: {r.feedback}</p>}
          </li>
        );
      })}
    </ol>
  );
}
