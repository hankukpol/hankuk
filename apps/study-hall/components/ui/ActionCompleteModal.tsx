"use client";

import { AnimatePresence, motion } from "framer-motion";

type ActionCompleteModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  notice?: string;
  badge?: string;
  confirmLabel?: string;
  widthClassName?: string;
};

export function ActionCompleteModal({
  open,
  onClose,
  title,
  description,
  notice = "변경 내용은 현재 화면에 바로 반영되며, 새로고침 이후에도 유지됩니다.",
  badge = "처리 완료",
  confirmLabel = "확인",
  widthClassName = "max-w-md",
}: ActionCompleteModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-slate-900/38 backdrop-blur-[2px]"
          >
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="h-full w-full cursor-default"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -15 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative z-10 w-full ${widthClassName} overflow-hidden rounded-[18px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]`}
          >
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-sm font-semibold text-slate-500">{badge}</p>
              <h2 className="mt-2 text-[28px] font-bold tracking-tight text-slate-950">
                {title}
              </h2>
            </div>

            <div className="px-6 py-6">
              {description ? (
                <p className="text-sm leading-7 text-slate-700">{description}</p>
              ) : null}

              <div className="mt-5 rounded-[14px] bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                {notice}
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center rounded-[12px] bg-[var(--division-color)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
