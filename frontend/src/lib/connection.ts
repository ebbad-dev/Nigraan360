import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { API_BASE_URL, endpoints } from "@/config/endpoints";

export type ConnectionState = "checking" | "online" | "reconnected" | "offline" | "unreachable";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

async function pingApi(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${API_BASE_URL}${endpoints.health}`, { cache: "no-store", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Browser connectivity (navigator.onLine) and API reachability are tracked separately:
 * a browser can report "online" while the Nigran 360 server is unreachable.
 */
export function useConnection() {
  const browserOnline = useBrowserOnline();
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [reconnected, setReconnected] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const wasDown = useRef(false);

  const recheck = useCallback(async () => {
    const ok = navigator.onLine ? await pingApi() : false;
    setApiReachable(ok);
    setLastCheckedAt(Date.now());
    if (ok && wasDown.current) {
      setReconnected(true);
      window.setTimeout(() => setReconnected(false), 6000);
    }
    wasDown.current = !ok;
    return ok;
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck, browserOnline]);

  useEffect(() => {
    const id = window.setInterval(() => void recheck(), apiReachable === false ? 4000 : 15000);
    return () => window.clearInterval(id);
  }, [recheck, apiReachable]);

  let state: ConnectionState = "checking";
  if (!browserOnline) state = "offline";
  else if (apiReachable === false) state = "unreachable";
  else if (apiReachable === true) state = reconnected ? "reconnected" : "online";

  return { state, browserOnline, apiReachable, lastCheckedAt, recheck };
}
