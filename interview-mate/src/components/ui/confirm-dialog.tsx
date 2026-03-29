"use client";

import type { ReactNode } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  tone?: "default" | "danger";
  children?: ReactNode;
  contentClassName?: string;
  isPending?: boolean;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  cancelText = "취소",
  tone = "default",
  children,
  contentClassName,
  isPending = false,
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={cn(
              "w-full max-w-[360px] rounded-[10px] border border-black/5 bg-white p-5 shadow-header",
              contentClassName,
            )}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-950">{title}</h3>
                <p className="text-sm leading-6 text-slate-600">{description}</p>
              </div>
              <button
                type="button"
                className="rounded-[10px] border border-slate-200 p-2 text-slate-500"
                onClick={onCancel}
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children ? <div className="mt-4">{children}</div> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                onClick={onCancel}
                disabled={isPending}
              >
                {cancelText}
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold text-white",
                  tone === "danger"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-[var(--division-color)] hover:opacity-90",
                )}
                onClick={onConfirm}
                disabled={isPending || confirmDisabled}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
