import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Live examiner announcements inside the exam workspace (polls; survives brief outages). */
export function ExamAnnouncements({ examId }: { examId: string }) {
  const query = useQuery({
    queryKey: ["exam-announcements-live", examId],
    queryFn: () => api.listAnnouncements(examId),
    enabled: !!examId,
    refetchInterval: 20_000,
    retry: 1,
  });
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const items: any[] = (query.data ?? []).filter((a: any) => !a.withdrawn_at);

  useEffect(() => {
    if (!query.data) return;
    const ids = items.map((a) => a.announcement_id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    if (added.length) {
      added.forEach((id) => seen.current!.add(id));
      setFresh((current) => new Set([...current, ...added]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const visible = items.filter((a) => !hidden.has(a.announcement_id)).slice(0, 3);
  if (!visible.length) return null;
  return (
    <div className="mb-3 space-y-2" role="region" aria-label="Examiner announcements" aria-live="polite">
      {visible.map((a) => (
        <div
          key={a.announcement_id}
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-2 text-sm",
            a.priority === "urgent" ? "border-red-400/50 bg-red-500/15" : a.priority === "important" ? "border-amber-400/50 bg-amber-500/10" : "border-sky-400/40 bg-sky-500/10",
          )}
          data-testid="exam-announcement"
        >
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">
              {a.title}
              {fresh.has(a.announcement_id) && <span className="ml-2 rounded bg-primary px-1.5 text-[10px] uppercase text-primary-foreground">New</span>}
            </p>
            <p className="text-foreground/90">{a.body}</p>
            <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleTimeString()}</p>
          </div>
          <button type="button" aria-label="Dismiss announcement" onClick={() => setHidden((current) => new Set([...current, a.announcement_id]))}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
}
