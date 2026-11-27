import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { api, ApiError, type AttemptSaveResult } from "@/lib/api";

/**
 * Durable answer outbox for one attempt (Innovation 5.3).
 *
 * Every change is written to localStorage first, then sent with a unique mutation_id and a
 * per-attempt monotonically increasing client_seq. The server is authoritative: it replays
 * duplicates, rejects stale (older) changes, and refuses anything after the server deadline.
 * A local entry is never presented as saved until the server acknowledges it.
 */

export type ChangeKind = "answer" | "flag";

export interface AnswerPayload {
  selected_option_id?: string;
  selected_option_ids?: string[];
  response_text?: string;
  flagged?: boolean;
}

export interface PendingChange {
  key: string;
  question_id: string;
  kind: ChangeKind;
  payload: AnswerPayload;
  mutation_id: string;
  client_seq: number;
  queued_at: string;
  tries: number;
}

export type ClosedReason = "attempt_expired" | "attempt_locked" | null;

export interface OutboxState {
  pending: PendingChange[];
  confirmed: Record<string, AttemptSaveResult>;
  failed: Record<string, string>;
  flushing: boolean;
  lastSyncedAt: string | null;
  lastNetworkError: string | null;
  closed: ClosedReason;
  closedMessage: string;
  discarded: number;
}

interface Stored {
  seq: number;
  pending: PendingChange[];
}

const STORAGE_PREFIX = "n360:outbox:v1:";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

class AttemptOutbox {
  private attemptId: string;
  private seq = 0;
  private listeners = new Set<() => void>();
  private flushPromise: Promise<void> | null = null;
  state: OutboxState;

  constructor(attemptId: string) {
    this.attemptId = attemptId;
    const stored = this.read();
    this.seq = stored.seq;
    this.state = {
      pending: stored.pending,
      confirmed: {},
      failed: {},
      flushing: false,
      lastSyncedAt: null,
      lastNetworkError: null,
      closed: null,
      closedMessage: "",
      discarded: 0,
    };
  }

  private storageKey() {
    return `${STORAGE_PREFIX}${this.attemptId}`;
  }

  private read(): Stored {
    try {
      const raw = window.localStorage.getItem(this.storageKey());
      if (!raw) return { seq: 0, pending: [] };
      const parsed = JSON.parse(raw) as Stored;
      return { seq: Number(parsed.seq) || 0, pending: Array.isArray(parsed.pending) ? parsed.pending : [] };
    } catch {
      return { seq: 0, pending: [] };
    }
  }

  private persist() {
    try {
      if (!this.state.pending.length && this.seq === 0) window.localStorage.removeItem(this.storageKey());
      else window.localStorage.setItem(this.storageKey(), JSON.stringify({ seq: this.seq, pending: this.state.pending }));
    } catch {
      // Storage full or blocked: changes stay in memory and are still sent while online.
    }
  }

  private set(patch: Partial<OutboxState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  seed(serverMaxSeq: number) {
    if (serverMaxSeq > this.seq) {
      this.seq = serverMaxSeq;
      this.persist();
    }
  }

  enqueue(questionId: string, kind: ChangeKind, payload: AnswerPayload) {
    if (this.state.closed) return;
    const key = `${questionId}:${kind}`;
    this.seq += 1;
    const change: PendingChange = {
      key,
      question_id: questionId,
      kind,
      payload,
      mutation_id: newId(),
      client_seq: this.seq,
      queued_at: new Date().toISOString(),
      tries: 0,
    };
    const failed = { ...this.state.failed };
    delete failed[questionId];
    this.set({ pending: [...this.state.pending.filter((item) => item.key !== key), change], failed });
    this.persist();
  }

  flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.runFlush().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  private async runFlush() {
    if (this.state.closed || !this.state.pending.length) return;
    this.set({ flushing: true });
    try {
      // Send in client_seq order so a newer change can never arrive before an older one.
      const queue = [...this.state.pending].sort((a, b) => a.client_seq - b.client_seq);
      for (const change of queue) {
        const current = this.state.pending.find((item) => item.key === change.key);
        if (!current || current.mutation_id !== change.mutation_id) continue;
        try {
          const result = await api.saveAttemptResponse(this.attemptId, {
            question_id: change.question_id,
            kind: change.kind,
            ...change.payload,
            mutation_id: change.mutation_id,
            client_seq: change.client_seq,
          });
          this.acknowledge(change, result);
        } catch (err) {
          if (!(err instanceof ApiError) || err.network) {
            this.bumpTries(change);
            this.set({ lastNetworkError: err instanceof Error ? err.message : "Network error" });
            return;
          }
          if (err.code === "attempt_expired" || err.code === "attempt_locked") {
            const discarded = this.state.pending.length;
            this.set({ pending: [], closed: err.code, closedMessage: err.message, discarded });
            this.persist();
            return;
          }
          // Validation or permission problem: the server rejected this change permanently.
          this.set({
            pending: this.state.pending.filter((item) => item.mutation_id !== change.mutation_id),
            failed: { ...this.state.failed, [change.question_id]: err.message },
          });
          this.persist();
        }
      }
    } finally {
      this.set({ flushing: false });
    }
  }

  private bumpTries(change: PendingChange) {
    this.set({
      pending: this.state.pending.map((item) => (item.mutation_id === change.mutation_id ? { ...item, tries: item.tries + 1 } : item)),
    });
    this.persist();
  }

  private acknowledge(change: PendingChange, result: AttemptSaveResult) {
    this.set({
      pending: this.state.pending.filter((item) => item.mutation_id !== change.mutation_id),
      // "stale" means the server already holds a newer change; adopt the server's copy.
      confirmed: { ...this.state.confirmed, [change.question_id]: result },
      lastSyncedAt: new Date().toISOString(),
      lastNetworkError: null,
    });
    this.persist();
  }
}

const outboxes = new Map<string, AttemptOutbox>();

function outboxFor(attemptId: string): AttemptOutbox {
  let box = outboxes.get(attemptId);
  if (!box) {
    box = new AttemptOutbox(attemptId);
    outboxes.set(attemptId, box);
  }
  return box;
}

const EMPTY: OutboxState = {
  pending: [],
  confirmed: {},
  failed: {},
  flushing: false,
  lastSyncedAt: null,
  lastNetworkError: null,
  closed: null,
  closedMessage: "",
  discarded: 0,
};

export function useAttemptOutbox(attemptId: string, enabled: boolean) {
  const box = useMemo(() => (attemptId && typeof window !== "undefined" ? outboxFor(attemptId) : null), [attemptId]);
  const state = useSyncExternalStore(
    box ? box.subscribe : () => () => undefined,
    box ? box.getSnapshot : () => EMPTY,
    () => EMPTY,
  );

  const flush = useCallback(() => (box && enabled ? box.flush() : Promise.resolve()), [box, enabled]);

  useEffect(() => {
    if (!box || !enabled) return;
    void box.flush();
    const onOnline = () => void box.flush();
    window.addEventListener("online", onOnline);
    const id = window.setInterval(() => {
      if (box.state.pending.length) void box.flush();
    }, 4000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(id);
    };
  }, [box, enabled]);

  return {
    state,
    flush,
    seed: (serverMaxSeq: number) => box?.seed(serverMaxSeq),
    enqueue: (questionId: string, kind: ChangeKind, payload: AnswerPayload) => box?.enqueue(questionId, kind, payload),
  };
}
