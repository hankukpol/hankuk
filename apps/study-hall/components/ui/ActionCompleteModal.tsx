"use client";

import { Modal } from "@/components/ui/Modal";

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
  notice = "저장된 내용은 현재 화면에 바로 반영되며, 새로고침 후에도 유지됩니다.",
  badge = "저장 완료",
  confirmLabel = "확인",
  widthClassName = "max-w-md",
}: ActionCompleteModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      badge={badge}
      title={title}
      description={description}
      widthClassName={widthClassName}
    >
      <div className="space-y-5">
        <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900">
          {notice}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
