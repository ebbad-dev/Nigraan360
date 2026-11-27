import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { ArrowRight, BadgeCheck, Eye, EyeOff, LockKeyhole, UsersRound, WifiOff } from "lucide-react";
import { BrandLockup } from "@/components/brand/Brand";
import { GlowButton } from "@/components/common/GlowButton";
import { API_BASE_URL, endpoints } from "@/config/endpoints";
import { api } from "@/lib/api";
import { redirectForRole } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in - Nigran 360" },
      {
        name: "description",
        content: "Sign in to Nigran 360, the secure examination management system.",
      },
    ],
  }),
  component: LoginPage,
});

const DEMO_ROLES = [
  { label: "Administrator", email: "admin@nigran360.demo", password: "Nigran360!Admin", color: "text-blue-400" },
  { label: "Examiner", email: "examiner@nigran360.demo", password: "Nigran360!Examiner", color: "text-teal-400" },
  { label: "Candidate", email: "candidate@nigran360.demo", password: "Nigran360!Candidate", color: "text-amber-400" },
] as const;

function LoginPage() {
  const navigate = useNavigate();
  const oauthError =
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("oauth_error") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!email.includes("@") || password.length < 1) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await api.login(email, password);
      navigate({ to: redirectForRole(session.user.role) });
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  const fillRole = (roleEmail: string, rolePassword: string) => {
    setEmail(roleEmail);
    setPassword(rolePassword);
    setError("");
  };

  return (
    <AuthShell eyebrow="Secure examination management" title="Sign in">
      <div className="mb-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Sign in as</p>
        <div className="grid grid-cols-3 gap-2">
          {DEMO_ROLES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => fillRole(r.email, r.password)}
              className="rounded-lg border border-input bg-secondary px-2 py-2 text-center text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            >
              <span className={`block text-sm font-semibold ${r.color}`}>{r.label}</span>
              <span className="block mt-0.5 text-muted-foreground">demo account</span>
            </button>
          ))}
        </div>
      </div>
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <label className="block text-sm">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            Password
          </span>
          <div className="flex h-11 items-center rounded-lg border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={show ? "text" : "password"}
              autoComplete="current-password"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {(error || oauthError) && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {error || oauthError}
          </p>
        )}

        <GoogleAuthButton label="Continue with Google" />

        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.08em] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>Email access</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <GlowButton disabled={submitting} className="w-full" size="lg">
          <LockKeyhole className="h-4 w-4" />
          {submitting ? "Verifying..." : "Sign in securely"}
          {!submitting && <ArrowRight className="h-4 w-4" />}
        </GlowButton>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <Link to="/forgot-password" className="transition hover:text-white">
            Forgot password?
          </Link>
          <span>
            New student?{" "}
            <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Create account
            </Link>
          </span>
        </div>
      </form>
    </AuthShell>
  );
}

export function GoogleAuthButton({ label = "Continue with Google" }: { label?: string }) {
  const onClick = () => {
    window.location.assign(`${API_BASE_URL}${endpoints.googleStart}`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-input bg-secondary px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-bold text-slate-950">
        G
      </span>
      {label}
    </button>
  );
}

export function AuthShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-[1fr_480px]">
        <div className="flex flex-col justify-between gap-10 bg-sidebar px-6 py-10 sm:px-10 lg:py-14">
          <BrandLockup size="lg" />
          <div className="max-w-xl">
            <p className="text-sm font-medium uppercase tracking-[0.08em] text-sidebar-foreground/70">{eyebrow}</p>
            <h1 className="mt-3 text-3xl leading-tight text-sidebar-foreground md:text-[2.5rem] md:leading-[1.15]">
              Fair exams, verified results.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-sidebar-foreground/75">
              Create, deliver, monitor and grade examinations with a server-enforced clock, answers that survive
              outages, and results anyone can verify.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { icon: WifiOff, label: "Resilient delivery", value: "Answers queue safely offline; time never extends" },
                { icon: BadgeCheck, label: "Verified results", value: "Every report carries a QR verification code" },
                { icon: UsersRound, label: "Role-based access", value: "Administrator, examiner and candidate" },
              ].map((item) => (
                <li key={item.label} className="border-t border-sidebar-border pt-3">
                  <item.icon className="h-5 w-5 text-sidebar-primary" aria-hidden />
                  <div className="mt-2 text-sm font-medium text-sidebar-foreground">{item.label}</div>
                  <div className="mt-1 text-sm leading-5 text-sidebar-foreground/65">{item.value}</div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-sidebar-foreground/55">Technoverse 5.0 · Secure Examination Management System</p>
        </div>

        <div className="flex items-center px-6 py-10 sm:px-10">
          <div className="w-full rounded-2xl border border-border bg-card p-6 sm:p-8">
            <h2 className="text-2xl font-semibold">{title}</h2>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">Use your Nigran 360 account.</p>
            {children}
            <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
              Passwords are hashed, permissions are enforced on the server, and sign-ins are audit-logged.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
