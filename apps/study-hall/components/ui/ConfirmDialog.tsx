"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderCircle, X } from "lucide-react";
import { useId } from "react";

import { useDialogFocus } from "@/lib/useDialogFocus";
import { MODAL_SPRING, OVERLAY_FADE, withReducedMotion } from "@/lib/motion";

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

/**
 * DESIGN.md 5.10 — 확인창. 최대 512px, 공통 제목·본문·footer·닫기 규격.
 * 위험 확인은 admin-danger, 일반 확인은 강조색 primary.
 */
const CONFIRM_BUTTON_CLASS: Record<NonNullable<ConfirmDialogProps["variant"]>, string> = {
  danger: "admin-button admin-button-danger",
  warning: "admin-button admin-button-primary",
  default: "admin-button admin-button-primary",
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
  const shouldReduceMotion = useReducedMotion();
  const close = () => { if (!isLoading) onCancel(); };
  const panelRef = useDialogFocus<HTMLDivElement>(open, close);
  const titleId = useId();

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={withReducedMotion(OVERLAY_FADE, shouldReduceMotion)}
            className="admin-overlay"
          >
            <button
              type="button"
              aria-label="닫기"
              onClick={close}
              tabIndex={-1}
              className="admin-overlay-dismiss"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={withReducedMotion(MODAL_SPRING, shouldReduceMotion)}
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="admin-dialog relative z-10 w-full max-w-[512px]"
          >
            <div className="admin-dialog-header">
              <h2 id={titleId} className="admin-dialog-title break-keep">
                {title}
              </h2>
              <button
                type="button"
                onClick={close}
                disabled={isLoading}
                className="admin-dialog-close"
                aria-label="닫기"
                title="닫기"
              >
                <X />
              </button>
            </div>

            {description ? (
              <div className="admin-dialog-body">
                <p className="text-[15px] leading-[1.5] text-admin-text break-keep">
                  {description}
                </p>
              </div>
            ) : null}

            <div className="admin-dialog-footer">
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="admin-button"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className={CONFIRM_BUTTON_CLASS[variant]}
              >
                {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
