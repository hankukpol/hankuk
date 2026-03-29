"use client";

import { AbsenceStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

type Props = {
  noteId: number;
  status: AbsenceStatus;
};

export function AbsenceNoteActions({ noteId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleAction(action: "approve" | "reject" | "revert") {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/absence-notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
          cache: "no-store",
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "처리에 실패했습니다.");
        }

        const successMessages: Record<"approve" | "reject" | "revert", string> = {
          approve: "승인 처리되었습니다.",
          reject: "반려 처리되었습니다.",
          revert: "승인이 취소되어 대기 상태로 되돌렸습니다.",
        };
        toast.success(successMessages[action]);
        router.refresh();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "처리에 실패했습니다.");
      }
    });
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
      <h2 className="text-base font-semibold text-ink">처리 액션</h2>

      <div className="mt-5">
        {status === AbsenceStatus.PENDING && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate">
              이 사유서는{" "}
              <strong className="text-amber-700">검토 대기</strong>{" "}
              상태입니다. 승인하거나 반려하세요.
            </p>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleAction("approve")}
              className="inline-flex w-full items-center justify-center rounded-full bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "승인"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleAction("reject")}
              className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "반려"}
            </button>
          </div>
        )}

        {status === AbsenceStatus.APPROVED && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate">
              이 사유서는{" "}
              <strong className="text-green-700">승인</strong>{" "}
              상태입니다. 취소하면 대기 상태로 돌아갑니다.
            </p>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleAction("revert")}
              className="inline-flex w-full items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "승인 취소 (대기로 되돌리기)"}
            </button>
          </div>
        )}

        {status === AbsenceStatus.REJECTED && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">
                이 사유서는 <strong>반려</strong> 상태입니다.
                재검토가 필요한 경우 학생에게 재제출을 안내하세요.
              </p>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleAction("revert")}
              className="inline-flex w-full items-center justify-center rounded-full border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-ink/30 hover:bg-mist disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "되돌리기 (대기로 변경)"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
