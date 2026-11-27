import { useCallback, useEffect, useState } from "react";

/**
 * Candidate workspace preferences (4.7). Display-only: stored per user in this browser under
 * `n360:prefs:v1:<userId>` and never sent to the server, so they cannot affect timing,
 * question order, eligibility or marking.
 */

export type TextScale = 100 | 112 | 125 | 140;
export interface WorkspacePrefs {
  textScale: TextScale;
  highContrast: boolean;
  focusLayout: boolean;
}

export const DEFAULT_PREFS: WorkspacePrefs = { textScale: 100, highContrast: false, focusLayout: false };
const PREFIX = "n360:prefs:v1:";
const SCALES: TextScale[] = [100, 112, 125, 140];

export function readPrefs(userId: string): WorkspacePrefs {
  if (typeof window === "undefined" || !userId) return DEFAULT_PREFS;
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFIX + userId) || "{}");
    return {
      textScale: SCALES.includes(raw.textScale) ? raw.textScale : DEFAULT_PREFS.textScale,
      highContrast: typeof raw.highContrast === "boolean" ? raw.highContrast : DEFAULT_PREFS.highContrast,
      focusLayout: typeof raw.focusLayout === "boolean" ? raw.focusLayout : DEFAULT_PREFS.focusLayout,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function applyPrefs(prefs: WorkspacePrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--text-scale", String(prefs.textScale / 100));
  root.dataset.textScale = String(prefs.textScale);
  root.classList.toggle("contrast-high", prefs.highContrast);
}

export function useWorkspacePrefs(userId: string) {
  const [prefs, setPrefsState] = useState<WorkspacePrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const loaded = readPrefs(userId);
    setPrefsState(loaded);
    applyPrefs(loaded);
  }, [userId]);

  const update = useCallback(
    (patch: Partial<WorkspacePrefs>) => {
      setPrefsState((current) => {
        const next = { ...current, ...patch };
        applyPrefs(next);
        try {
          window.localStorage.setItem(PREFIX + userId, JSON.stringify(next));
          setSaved(true);
        } catch {
          setSaved(false);
        }
        return next;
      });
    },
    [userId],
  );

  return { prefs, update, saved };
}
