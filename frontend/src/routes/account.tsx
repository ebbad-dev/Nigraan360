import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/common/GlassCard";
import { GlowButton } from "@/components/common/GlowButton";
import { api } from "@/lib/api";
import { getAuthSession } from "@/lib/auth";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account · نگران 360" }] }),
  component: AccountPage,
});

const ROLE_LABEL: Record<string, string> = { admin: "Administrator", instructor: "Examiner", student: "Candidate" };

function passwordProblems(value: string) {
  const problems: string[] = [];
  if (value.length < 8) problems.push("at least 8 characters");
  if (!/[A-Z]/.test(value)) problems.push("an uppercase letter");
  if (!/[a-z]/.test(value)) problems.push("a lowercase letter");
  if (!/\d/.test(value)) problems.push("a number");
  return problems;
}

const inputCls =
  "mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

function AccountPage() {
  const user = getAuthSession()?.user;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const problems = next ? passwordProblems(next) : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setDone(false);
    if (problems.length) return setError(`New password needs ${problems.join(", ")}.`);
    if (next !== confirm) return setError("The new passwords do not match.");
    setSaving(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl text-foreground">Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your profile and sign-in security.</p>
        </div>
        <GlassCard className="p-6">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt><dd>{user?.full_name}</dd>
            <dt className="text-muted-foreground">Email</dt><dd>{user?.email}</dd>
            <dt className="text-muted-foreground">Role</dt><dd>{ROLE_LABEL[user?.role ?? ""] ?? user?.role}</dd>
            <dt className="text-muted-foreground">Institution</dt><dd>{user?.tenant_name || "Default Institution"}</dd>
          </dl>
        </GlassCard>
        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold">Change password</h2>
          <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
            <label className="block text-sm font-medium">Current password
              <input type="password" autoComplete="current-password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium">New password
              <input type="password" autoComplete="new-password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="pw-rules" required />
            </label>
            <p id="pw-rules" className="text-xs text-muted-foreground">
              At least 8 characters with an uppercase letter, a lowercase letter and a number.
              {next && problems.length > 0 && <span className="text-amber-300"> Still needs: {problems.join(", ")}.</span>}
            </p>
            <label className="block text-sm font-medium">Confirm new password
              <input type="password" autoComplete="new-password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {done && <p role="status" className="text-sm text-emerald-300">Password changed. Use it the next time you sign in.</p>}
            <GlowButton type="submit" disabled={saving || !current || !next || !confirm}>{saving ? "Saving…" : "Change password"}</GlowButton>
          </form>
        </GlassCard>
      </div>
    </AppShell>
  );
}
