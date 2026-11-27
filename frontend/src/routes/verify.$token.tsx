import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { BrandLockup } from "@/components/brand/Brand";
import { GlassCard } from "@/components/common/GlassCard";

export const Route = createFileRoute("/verify/$token")({
  head: () => ({ meta: [{ title: "Verify report · نگران 360" }] }),
  component: VerifyPage,
});

function VerifyPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<"loading" | "valid" | "invalid">("loading");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    api.verifyReport(token)
      .then((res) => {
        setData(res);
        setState(res.valid ? "valid" : "invalid");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center mb-6">
          <BrandLockup size="lg" className="justify-center" />
          <h1 className="sr-only">Nigran 360 report verification</h1>
          <p className="text-sm text-muted-foreground">Official Report Verification</p>
        </div>

        {state === "loading" && (
          <GlassCard className="p-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </GlassCard>
        )}

        {state === "valid" && data && (
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-400 shrink-0" />
              <div>
                <p className="font-semibold text-green-300">Report Verified</p>
                <p className="text-xs text-muted-foreground">This document was issued by Nigran 360 and has not been revoked.</p>
              </div>
            </div>
            <div className="border-t border-border pt-4 space-y-2 text-sm">
              {[
                { label: "Report Type", value: data.report_type },
                { label: "Examination", value: data.exam_title },
                { label: "Report ID", value: data.report_id, mono: true },
                { label: "Issued", value: data.issued_at ? new Date(data.issued_at).toLocaleString() : "—" },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`text-foreground text-right ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {state === "invalid" && (
          <GlassCard className="p-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-6 w-6 text-destructive shrink-0" />
              <div>
                <p className="font-semibold text-destructive">
                  {data?.status === "revoked" ? "Report Revoked" : "Report Not Found"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data?.message || "No report matches this verification code. The document may be invalid or not issued by Nigran 360."}
                </p>
              </div>
            </div>
            {data?.status === "revoked" && data?.revoked_at && (
              <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3">
                Revoked on {new Date(data.revoked_at).toLocaleString()}
              </p>
            )}
          </GlassCard>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Verification powered by Nigran 360 · Secure Examination Management
        </p>
      </div>
    </div>
  );
}
