"use client";

import { Check } from "lucide-react";

import type { PhoneCheckStatus } from "@/lib/services/phone-submission.service";

export const PHONE_CHECK_STATUS_OPTIONS: PhoneCheckStatus[] = [
  "SUBMITTED",
  "NOT_SUBMITTED",
  "RENTED",
];

export const PHONE_CHECK_STATUS_LABEL: Record<PhoneCheckStatus, string> = {
  SUBMITTED: "반납",
  NOT_SUBMITTED: "미반납",
  RENTED: "대여",
};

const SELECTED_BUTTON_CLASS: Record<PhoneCheckStatus, string> = {
  SUBMITTED: "border-admin-success-line bg-admin-success-soft text-admin-success",
  NOT_SUBMITTED: "border-admin-danger-line bg-admin-danger-soft text-admin-danger",
  RENTED: "border-sky-300 bg-sky-50 text-sky-800",
};

const SELECTED_CHECK_CLASS: Record<PhoneCheckStatus, string> = {
  SUBMITTED: "border-admin-success bg-admin-success text-white",
  NOT_SUBMITTED: "border-admin-danger bg-admin-danger text-white",
  RENTED: "border-sky-600 bg-sky-600 text-white",
};

type PhoneStatusCheckButtonProps = {
  status: PhoneCheckStatus;
  selected: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
};

export function PhoneStatusCheckButton({
  status,
  selected,
  onClick,
  className = "",
  disabled = false,
  size = "sm",
}: PhoneStatusCheckButtonProps) {
  const sizeClassName = size === "md" ? "h-10 px-3 text-sm" : "h-8 px-3 text-xs";

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition focus-visible:border-admin-accent ${ selected ? SELECTED_BUTTON_CLASS[status] : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" } ${sizeClassName} ${disabled ? "cursor-wait opacity-60" : ""} ${className}`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${ selected ? SELECTED_CHECK_CLASS[status] : "border-slate-300 bg-white text-transparent" }`}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span>{PHONE_CHECK_STATUS_LABEL[status]}</span>
    </button>
  );
}
