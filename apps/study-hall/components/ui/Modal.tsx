"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  badge?: string;
  widthClassName?: string;
  children: ReactNode;
  onClose: () => void;
};

export function Modal({
  open,
  title,
  description,
  badge,
  widthClassName = "max-w-4xl",
  children,
  onClose,
}: ModalProps) {
  // body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Escape 키 닫기
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
          {/* 배경 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          >
            <button
              type="button"
              aria-label="모달 닫기"
              onClick={onClose}
              className="h-full w-full cursor-default"
            />
          </motion.div>

          {/* 모달 박스 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -15 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative z-10 flex w-full flex-col overflow-hidden rounded-[10px] border border-slate-200 bg-white ${widthClassName}`}
            style={{ maxHeight: "calc(100vh - 2rem)" }}
          >
            {/* 헤더 */}
            <div className="shrink-0 border-b border-slate-200 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {badge && (
                    <span className="inline-flex border border-slate-200-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-500">
                      {badge}
                    </span>
                  )}
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                    {title}
                  </h2>
                  {description && (
                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-slate-200-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-400">ESC 키로 바로 닫을 수 있습니다.</p>
            </div>

            {/* 본문 (스크롤) */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-5">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
