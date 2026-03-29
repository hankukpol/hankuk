"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type SlideOverProps = {
  open: boolean;
  title: string;
  description?: string;
  badge?: string;
  footer?: ReactNode;
  widthClassName?: string;
  children: ReactNode;
  onClose: () => void;
};

export function SlideOver({
  open,
  title,
  description,
  badge = "빠른 입력",
  footer,
  widthClassName = "max-w-3xl",
  children,
  onClose,
}: SlideOverProps) {
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-white  cursor-default"
          >
            <button
              type="button"
              aria-label="패널 닫기"
              onClick={onClose}
              className="h-full w-full"
            />
          </motion.div>

          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} // Snappy, sharp ease-out
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`absolute inset-y-0 right-0 flex h-full w-full ${widthClassName} flex-col border-l border-slate-200 bg-white`}
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-flex border border-slate-200-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-500">
                    {badge}
                  </span>
                  <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{title}</h2>
                  {description ? (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-slate-200-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 text-xs font-medium text-slate-400">ESC 키로 바로 닫을 수 있습니다.</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-5 sm:px-6">
              {children}
            </div>

            {footer ? (
              <div className="border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
                {footer}
              </div>
            ) : null}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
