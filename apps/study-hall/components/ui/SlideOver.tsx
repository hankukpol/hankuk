"use client";

import { X } from "lucide-react";
import { type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import { useDialogFocus } from "@/lib/useDialogFocus";
import { DialogContent } from "@/components/ui/DialogActions";
import { DRAWER_SPRING, OVERLAY_FADE, withReducedMotion } from "@/lib/motion";

type SlideOverProps = {
  open: boolean;
  title: string;
  description?: string;
  badge?: string;
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
};

/**
 * DESIGN.md 5.10 — 우측 슬라이드 drawer.
 * 폭 min(760px, 100%), 모서리 0, header/footer는 남고 body만 스크롤한다.
 * 입력·등록·편집·상세 조회 작업에 사용한다.
 */
export function SlideOver({
  open,
  title,
  description,
  badge,
  footer,
  children,
  onClose,
}: SlideOverProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useDialogFocus<HTMLElement>(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={withReducedMotion(OVERLAY_FADE, shouldReduceMotion)}
            className="admin-overlay"
          >
            <button
              type="button"
              aria-label="패널 닫기"
              onClick={onClose}
              tabIndex={-1}
              className="admin-overlay-dismiss"
            />
          </motion.div>

          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={withReducedMotion(DRAWER_SPRING, shouldReduceMotion)}
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="admin-drawer absolute inset-y-0 right-0"
          >
            <div className="admin-dialog-header">
              <div className="min-w-0">
                {badge ? <span className="admin-badge mb-2">{badge}</span> : null}
                <h2 className="admin-dialog-title break-keep">{title}</h2>
                {description ? (
                  <p className="admin-dialog-description break-keep">{description}</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="admin-dialog-close"
                aria-label="닫기"
                title="닫기"
              >
                <X />
              </button>
            </div>

            <DialogContent footer={footer}>{children}</DialogContent>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
