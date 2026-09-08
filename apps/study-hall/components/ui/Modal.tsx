"use client";

import { X } from "lucide-react";
import { type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import { useDialogFocus } from "@/lib/useDialogFocus";
import { DialogContent } from "@/components/ui/DialogActions";
import { MODAL_SPRING, OVERLAY_FADE, withReducedMotion } from "@/lib/motion";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  badge?: string;
  widthClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
};

/**
 * DESIGN.md 5.10 — 중앙 모달.
 * 외곽 8px, header/body/footer 직각, footer는 스크롤 본문 밖에 둔다.
 * 삭제·변경 폐기·최종 실행 확인과 짧은 안내에 사용한다.
 * 입력·등록·편집·상세 조회는 SlideOver(우측 drawer)를 쓴다.
 */
export function Modal({
  open,
  title,
  description,
  badge,
  widthClassName = "max-w-4xl",
  footer,
  children,
  onClose,
}: ModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useDialogFocus<HTMLDivElement>(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={withReducedMotion(OVERLAY_FADE, shouldReduceMotion)}
            className="admin-overlay"
          >
            <button
              type="button"
              aria-label="모달 닫기"
              onClick={onClose}
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
            aria-label={title}
            className={`admin-dialog relative z-10 w-full ${widthClassName}`}
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
