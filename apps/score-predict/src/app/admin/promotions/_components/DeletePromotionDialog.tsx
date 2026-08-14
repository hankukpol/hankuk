"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DeletePromotionDialogProps = {
  campaignName: string;
  error: string;
  isDeleting: boolean;
  open: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export default function DeletePromotionDialog({
  campaignName,
  error,
  isDeleting,
  open,
  onConfirm,
  onOpenChange,
}: DeletePromotionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isDeleting && onOpenChange(nextOpen)}>
      <DialogContent showCloseButton={!isDeleting}>
        <DialogHeader>
          <DialogTitle>프로모션을 삭제하시겠습니까?</DialogTitle>
          <DialogDescription>
            삭제한 캠페인은 관리자 목록에서 사라지며 복구할 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="border-l-2 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-950">
          <p className="font-semibold break-words">{campaignName}</p>
          <p className="mt-1 leading-6">
            임시저장 내용과 게시 이력이 함께 삭제됩니다. 회원, 시험, 제출 데이터와 업로드된 원본 이미지는 삭제하지 않습니다.
          </p>
        </div>

        {error ? (
          <p role="alert" className="border-l-2 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-950">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <button
              type="button"
              disabled={isDeleting}
              className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              취소
            </button>
          </DialogClose>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="inline-flex h-11 items-center justify-center rounded-md border border-rose-700 bg-rose-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "삭제 중..." : "영구 삭제"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
