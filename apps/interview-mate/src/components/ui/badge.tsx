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
    "bg-[var(--division-color)] text-white",
  success: "bg-emerald-500 text-white",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-600",
  info: "bg-sky-100 text-sky-700",
  neutral: "bg-slate-100 text-slate-600",
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
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none tracking-wide",
        toneClassMap[tone],
        className,
      )}
      {...props}
    />
  );
}
