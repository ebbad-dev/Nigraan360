import { cn } from "@/lib/utils";

/**
 * "Open noon" mark: the bowl of ن drawn as a near-complete 360° ring, with the noon's dot in
 * the gap. See docs/nigran360/redesign-audit/NIGRAN_BRAND_IDENTITY.md.
 */
export function NoonMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path
        d="M25.53 10.5 A11 11 0 1 1 21.5 6.47"
        fill="none"
        stroke="var(--brand-mark, #9db1f5)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <circle cx="23.9" cy="8.1" r="2.3" fill="var(--brand-dot, #e0a940)" />
    </svg>
  );
}

/**
 * The brand lockup نگران 360. Rendered right-to-left (نگران on the right, 360 on its left) and
 * isolated from surrounding text; the accessible name is the stable Latin "Nigran 360".
 */
export function Wordmark({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const urdu = { sm: "text-[1.35rem]", md: "text-[1.7rem]", lg: "text-[2.6rem]" }[size];
  const digits = { sm: "text-[0.95rem]", md: "text-[1.15rem]", lg: "text-[1.75rem]" }[size];
  return (
    <span role="img" aria-label="Nigran 360" className={cn("inline-flex items-center", className)}>
      <bdi dir="rtl" lang="ur" aria-hidden className="inline-flex items-center gap-[0.3em]">
        <span className={cn("font-urdu inline-block leading-none pt-[0.42em] pb-[0.08em]", urdu)}>نگران</span>
        <span dir="ltr" className={cn("font-display font-semibold tabular-nums", digits)}>360</span>
      </bdi>
    </span>
  );
}

export function BrandLockup({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const mark = { sm: "h-7 w-7", md: "h-8 w-8", lg: "h-12 w-12" }[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <NoonMark className={mark} />
      <Wordmark size={size} />
    </span>
  );
}
