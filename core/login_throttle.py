"""In-process sliding-window throttle for failed sign-ins.

Per (account, client IP) and per client IP. It is per process: with several API workers each
keeps its own window, which still bounds online guessing to a small multiple of the limits.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class LoginThrottle:
    def __init__(self, *, per_account: int = 5, per_ip: int = 30, window_seconds: int = 300, clock=time.monotonic):
        self.per_account = per_account
        self.per_ip = per_ip
        self.window = window_seconds
        self.clock = clock
        self._failures: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque:
        bucket = self._failures[key]
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        return bucket

    def retry_after(self, email: str, ip: str) -> int:
        """Seconds until another attempt is allowed; 0 when not throttled."""
        now = self.clock()
        with self._lock:
            waits = []
            for key, limit in ((f"acct:{email}|{ip}", self.per_account), (f"ip:{ip}", self.per_ip)):
                bucket = self._prune(key, now)
                if len(bucket) >= limit:
                    waits.append(int(self.window - (now - bucket[0])) + 1)
            return max(waits) if waits else 0

    def record_failure(self, email: str, ip: str) -> None:
        now = self.clock()
        with self._lock:
            self._failures[f"acct:{email}|{ip}"].append(now)
            self._failures[f"ip:{ip}"].append(now)

    def record_success(self, email: str, ip: str) -> None:
        with self._lock:
            self._failures.pop(f"acct:{email}|{ip}", None)
