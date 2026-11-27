import { CloudOff, Loader2, RefreshCw, ServerCrash, Wifi } from "lucide-react";
import type { ConnectionState } from "@/lib/connection";
import { cn } from "@/lib/utils";

interface Props {
  state: ConnectionState;
  pending: number;
  flushing: boolean;
  lastSyncedAt: string | null;
  onRetry: () => void;
}

export function ConnectionBanner({ state, pending, flushing, lastSyncedAt, onRetry }: Props) {
  const synced = lastSyncedAt ? `Last confirmed save ${new Date(lastSyncedAt).toLocaleTimeString()}.` : "";
  const variants: Record<ConnectionState, { icon: typeof Wifi; cls: string; text: string }> = {
    checking: { icon: Loader2, cls: "border-white/15 bg-white/[0.04] text-muted-foreground", text: "Checking connection to the Nigran 360 server…" },
    online: {
      icon: Wifi,
      cls: pending ? "border-amber-400/40 bg-amber-500/10 text-amber-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
      text: pending
        ? `Connected. Syncing ${pending} pending change(s)…`
        : `Connected. All changes are saved on the server. ${synced}`,
    },
    reconnected: {
      icon: RefreshCw,
      cls: "border-sky-400/40 bg-sky-500/10 text-sky-100",
      text: pending ? `Reconnected. Syncing ${pending} pending change(s) and checking them against the server…` : "Reconnected. Everything on this device has been reconciled with the server.",
    },
    offline: {
      icon: CloudOff,
      cls: "border-red-400/40 bg-red-500/10 text-red-100",
      text: `You are offline. ${pending ? `${pending} change(s) are kept on this device and are NOT yet saved on the server.` : "Keep working: new answers will be kept on this device."} The timer keeps running on the server.`,
    },
    unreachable: {
      icon: ServerCrash,
      cls: "border-red-400/40 bg-red-500/10 text-red-100",
      text: `Your browser is online but the Nigran 360 server is not responding. ${pending ? `${pending} change(s) are waiting on this device.` : ""} Retrying automatically; the timer keeps running.`,
    },
  };
  const { icon: Icon, cls, text } = variants[state];
  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2 text-sm", cls)} role="status" aria-live="polite" data-testid="connection-banner" data-state={state}>
      <Icon className={cn("h-4 w-4 shrink-0", (state === "checking" || flushing) && "animate-spin")} aria-hidden />
      <span className="flex-1">{text}</span>
      {(state === "offline" || state === "unreachable" || pending > 0) && (
        <button type="button" onClick={onRetry} className="rounded-md border border-current/30 px-2 py-0.5 text-xs hover:bg-white/10">
          Retry now
        </button>
      )}
    </div>
  );
}
