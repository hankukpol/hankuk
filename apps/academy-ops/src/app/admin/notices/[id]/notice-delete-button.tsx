"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type NoticeDeleteButtonProps = {
  noticeId: number;
};

export function NoticeDeleteButton({ noticeId }: NoticeDeleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleDelete() {
    const confirmed = window.confirm(
      "이 공지사항을 삭제하시겠습니까? 삭제한 공지 내용은 다시 복구할 수 없습니다.",
    );

    if (!confirmed) return;

    setErrorMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/notices/${noticeId}`, {
          method: "DELETE",
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error ?? "삭제에 실패했습니다.");
        }

        router.push("/admin/notices");
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "삭제에 실패했습니다.",
        );
      }
    });
  }

  return (
    <>
      {errorMessage ? (
        <p className="w-full text-sm text-red-700">{errorMessage}</p>
      ) : null}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="inline-flex items-center rounded-full border border-red-200 px-6 py-3 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "삭제 중..." : "삭제"}
      </button>
    </>
  );
}
