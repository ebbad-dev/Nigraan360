import { useCallback, useEffect, useId, useRef, useState } from "react";
import { NotebookPen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  clearScratchpad,
  loadScratchpad,
  saveScratchpad,
  SCRATCH_MAX_CHARS,
  type ScratchWrite,
} from "@/lib/scratchpad";

const STORE_DELAY_MS = 300;

const STATUS: Record<ScratchWrite | "idle" | "cleared", string> = {
  idle: "Kept only in this browser on this device.",
  stored: "Kept only in this browser on this device.",
  cleared: "Scratchpad cleared.",
  "too-long": `Notes are limited to ${SCRATCH_MAX_CHARS.toLocaleString()} characters.`,
  "storage-full":
    "This browser is out of storage space, so your latest notes weren't kept. Copy anything you need.",
  "storage-unavailable":
    "This browser isn't allowing notes to be kept. They'll be lost if you reload or close the page.",
};

/**
 * Candidate rough-work panel (4.8). Plain text in a <textarea> — never rendered
 * as HTML. Notes stay in this browser and are never sent anywhere.
 */
export function Scratchpad({ userId, scope }: { userId: string; scope: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Scratchpad">
          <NotebookPen aria-hidden />
          <span className="hidden lg:inline">Scratchpad</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-3 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Scratchpad</SheetTitle>
          <SheetDescription>
            Rough work for you only. It is not an answer: it is never submitted, graded or seen by
            examiners. Notes stay in this browser on this device (not encrypted or backed up) and
            are cleared when you sign out.
          </SheetDescription>
        </SheetHeader>
        {open && <ScratchpadEditor key={`${userId}:${scope}`} userId={userId} scope={scope} />}
      </SheetContent>
    </Sheet>
  );
}

function ScratchpadEditor({ userId, scope }: { userId: string; scope: string }) {
  const id = useId();
  const [initial] = useState(() => loadScratchpad(userId, scope));
  const [text, setText] = useState(initial.text);
  const [status, setStatus] = useState<ScratchWrite | "idle" | "cleared">(
    initial.available ? "idle" : "storage-unavailable",
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);

  const store = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStatus(saveScratchpad(userId, scope, latest.current));
  }, [userId, scope]);

  // Store whatever is pending when the panel closes or the page unloads.
  useEffect(() => {
    const onHide = () => {
      if (timer.current) store();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
  }, [store]);

  const onChange = (value: string) => {
    const next = value.slice(0, SCRATCH_MAX_CHARS);
    latest.current = next;
    setText(next);
    if (value.length > SCRATCH_MAX_CHARS) setStatus("too-long");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(store, STORE_DELAY_MS);
  };

  const onClear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    latest.current = "";
    setText("");
    setStatus(clearScratchpad(userId, scope) ? "cleared" : "storage-unavailable");
  };

  const problem = status === "storage-full" || status === "storage-unavailable" || status === "too-long";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Label htmlFor={id}>Rough work</Label>
      <Textarea
        id={id}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => timer.current && store()}
        maxLength={SCRATCH_MAX_CHARS}
        spellCheck={false}
        autoComplete="off"
        aria-describedby={`${id}-status ${id}-count`}
        className="min-h-64 flex-1 resize-none font-mono text-sm"
        placeholder="Working, calculations, reminders…"
      />
      <div className="flex items-start justify-between gap-3 text-xs">
        <p
          id={`${id}-status`}
          role={problem ? "alert" : "status"}
          className={problem ? "font-medium text-destructive" : "text-muted-foreground"}
        >
          {STATUS[status]}
        </p>
        <span id={`${id}-count`} className="shrink-0 tabular-nums text-muted-foreground">
          {text.length.toLocaleString()} / {SCRATCH_MAX_CHARS.toLocaleString()}
        </span>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="self-start" disabled={text === ""}>
            <Trash2 aria-hidden />
            Clear scratchpad
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all rough work?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes your scratchpad notes from this browser. It can't be undone. Your exam
              answers are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep notes</AlertDialogCancel>
            <AlertDialogAction onClick={onClear}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
