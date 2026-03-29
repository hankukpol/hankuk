import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeTone =
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const toneClassMap: Record<BadgeTone, string> = {
  brand:
    "border-[var(--division-color-light)] bg-[var(--division-color-light)] text-[var(--division-color-dark)]",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  neutral: "border-slate-200 bg-slate-100 text-slate-600",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold",
        toneClassMap[tone],
        className,
      )}
      {...props}
    />
  );
}
