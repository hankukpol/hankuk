"use client";

import { X, LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const CONFIRM_BUTTON_CLASS: Record<NonNullable<ConfirmDialogProps["variant"]>, string> = {
  danger:
    "inline-flex items-center gap-2 bg-[var(--division-color,#e11d48)] px-5 py-2.5 text-sm font-semibold text-white rounded-full transition hover:opacity-90 disabled:opacity-60",
  warning:
    "inline-flex items-center gap-2 bg-[var(--division-color,#d97706)] px-5 py-2.5 text-sm font-semibold text-white rounded-full transition hover:opacity-90 disabled:opacity-60",
  default:
    "inline-flex items-center gap-2 bg-[var(--division-color,#0f172a)] px-5 py-2.5 text-sm font-semibold text-white rounded-full transition hover:opacity-90 disabled:opacity-60",
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  variant = "default",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Escape 키 닫기
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          {/* 배경 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-default"
          >
            <button
              type="button"
              aria-label="닫기"
              onClick={onCancel}
              className="h-full w-full"
            />
          </motion.div>

          {/* 모달 박스 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -15 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="relative z-10 w-full max-w-sm rounded-[10px] border border-slate-200 bg-white p-6 shadow-xl"
          >
            {/* 헤더 */}
            <div className="flex items-start justify-between gap-4">
              <h2
                id="confirm-dialog-title"
                className="text-xl font-bold tracking-tight text-slate-950"
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 설명 */}
            {description && (
              <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
            )}

            {/* 버튼 */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className={CONFIRM_BUTTON_CLASS[variant]}
              >
                {isLoading && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
