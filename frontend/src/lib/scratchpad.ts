/**
 * Digital scratchpad storage (Phase 7C, official 4.8) — browser-local only.
 *
 * - Rough work is plain text, kept ONLY in this browser's localStorage under
 *   `n360:scratch:v1:<userId>:<scope>`. It is never sent to the server, never
 *   part of an answer payload, and never seen by grading, monitoring or
 *   reports. This module deliberately imports no API client.
 * - Not encrypted, not backed up, not synchronised. Cleared on sign-out (the
 *   `n360:` prefix is wiped by clearPrivateClientData) and by the Clear action.
 * - `scope` is chosen by the caller. Until the attempt contract exists the
 *   candidate workspace uses "workspace"; Phase 4 will pass the real attempt id
 *   (e.g. "attempt:<id>") so notes stay per attempt.
 */

export const SCRATCH_PREFIX = "n360:scratch:v1:";
export const SCRATCH_MAX_CHARS = 20_000;

export type ScratchWrite = "stored" | "too-long" | "storage-full" | "storage-unavailable";

export function scratchpadKey(userId: string, scope: string) {
  return `${SCRATCH_PREFIX}${userId}:${scope}`;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadScratchpad(userId: string, scope: string): { text: string; available: boolean } {
  const store = storage();
  if (!store) return { text: "", available: false };
  try {
    const raw = store.getItem(scratchpadKey(userId, scope));
    return { text: typeof raw === "string" ? raw.slice(0, SCRATCH_MAX_CHARS) : "", available: true };
  } catch {
    return { text: "", available: false };
  }
}

export function saveScratchpad(userId: string, scope: string, text: string): ScratchWrite {
  if (text.length > SCRATCH_MAX_CHARS) return "too-long";
  const store = storage();
  if (!store) return "storage-unavailable";
  try {
    if (text === "") store.removeItem(scratchpadKey(userId, scope));
    else store.setItem(scratchpadKey(userId, scope), text);
    return "stored";
  } catch (err) {
    const name = typeof err === "object" && err !== null ? (err as { name?: string }).name : "";
    return name === "QuotaExceededError" ? "storage-full" : "storage-unavailable";
  }
}

export function clearScratchpad(userId: string, scope: string): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.removeItem(scratchpadKey(userId, scope));
    return true;
  } catch {
    return false;
  }
}
