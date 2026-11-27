import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { TextScale, WorkspacePrefs } from "@/lib/preferences";
import { cn } from "@/lib/utils";

export function WorkspacePreferences({
  prefs,
  update,
  saved,
}: {
  prefs: WorkspacePrefs;
  update: (patch: Partial<WorkspacePrefs>) => void;
  saved: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="workspace-prefs"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm hover:bg-white/10"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        <span className="hidden lg:inline">Display</span>
      </button>
      {open && (
        <div id="workspace-prefs" role="group" aria-label="Workspace display preferences" className="glass-strong absolute right-0 z-40 mt-2 w-72 space-y-4 rounded-xl p-4 text-sm">
          <fieldset>
            <legend className="mb-2 text-xs text-muted-foreground">Text size</legend>
            <div className="flex gap-1">
              {([100, 112, 125, 140] as TextScale[]).map((scale) => (
                <button
                  key={scale}
                  type="button"
                  aria-pressed={prefs.textScale === scale}
                  onClick={() => update({ textScale: scale })}
                  className={cn("flex-1 rounded-md border px-2 py-1 text-xs", prefs.textScale === scale ? "border-primary bg-primary/20 text-primary" : "border-white/10")}
                >
                  {scale}%
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center justify-between gap-2">
            High contrast
            <input type="checkbox" checked={prefs.highContrast} onChange={(e) => update({ highContrast: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between gap-2">
            Focus layout (hide side panels)
            <input type="checkbox" checked={prefs.focusLayout} onChange={(e) => update({ focusLayout: e.target.checked })} />
          </label>
          <p className="text-[11px] text-muted-foreground">
            {saved
              ? "Saved in this browser for your account. Display only: it never changes timing, questions or marking."
              : "This browser is blocking storage, so these settings last only until you reload."}
          </p>
        </div>
      )}
    </div>
  );
}
