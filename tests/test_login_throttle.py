import unittest

from core.login_throttle import LoginThrottle


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class LoginThrottleTests(unittest.TestCase):
    def test_blocks_after_five_failures_for_the_same_account_and_ip(self):
        clock = FakeClock()
        t = LoginThrottle(clock=clock)
        for _ in range(5):
            self.assertEqual(t.retry_after("a@x.test", "1.1.1.1"), 0)
            t.record_failure("a@x.test", "1.1.1.1")
        self.assertGreater(t.retry_after("a@x.test", "1.1.1.1"), 0)
        self.assertEqual(t.retry_after("b@x.test", "1.1.1.1"), 0)

    def test_window_expires(self):
        clock = FakeClock()
        t = LoginThrottle(clock=clock)
        for _ in range(5):
            t.record_failure("a@x.test", "1.1.1.1")
        clock.now += 301
        self.assertEqual(t.retry_after("a@x.test", "1.1.1.1"), 0)

    def test_success_resets_account_counter(self):
        t = LoginThrottle(clock=FakeClock())
        for _ in range(4):
            t.record_failure("a@x.test", "1.1.1.1")
        t.record_success("a@x.test", "1.1.1.1")
        t.record_failure("a@x.test", "1.1.1.1")
        self.assertEqual(t.retry_after("a@x.test", "1.1.1.1"), 0)

    def test_ip_wide_limit_stops_spraying_many_accounts(self):
        t = LoginThrottle(clock=FakeClock())
        for i in range(30):
            t.record_failure(f"user{i}@x.test", "2.2.2.2")
        self.assertGreater(t.retry_after("fresh@x.test", "2.2.2.2"), 0)


if __name__ == "__main__":
    unittest.main()
