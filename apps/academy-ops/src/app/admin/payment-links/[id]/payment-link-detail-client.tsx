"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionModal } from "@/components/ui/action-modal";

type Props = {
  linkId: number;
  token: string;
  canDisable: boolean;
};

export function PaymentLinkDetailClient({ linkId, token, canDisable }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState<boolean>(false);
  const [disableOpen, setDisableOpen] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  function handleCopy() {
    const url = `${window.location.origin}/pay/${token}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDisable() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/payment-links/${linkId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("비활성화 실패");
        setDisableOpen(false);
        router.refresh();
      } catch {
        // ignore
      }
    });
  }

  return (
    <>
      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={handleCopy}
          className="w-full rounded-full bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          {copied ? "복사됨" : "링크 복사"}
        </button>
        <a
          href={`/pay/${token}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-full border border-ink/15 px-4 py-2.5 text-center text-sm font-medium text-ink transition hover:border-ink/30"
        >
          미리보기
        </a>
        {canDisable && (
          <button
            type="button"
            onClick={() => setDisableOpen(true)}
            className="w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            비활성화
          </button>
        )}
      </div>

      <ActionModal
        open={disableOpen}
        badgeLabel="결제 링크"
        title="결제 링크 비활성화"
        description="이 결제 링크를 비활성화합니다. 이미 전송된 링크로 더 이상 결제할 수 없게 됩니다."
        confirmLabel="비활성화"
        cancelLabel="취소"
        confirmTone="danger"
        onClose={() => setDisableOpen(false)}
        onConfirm={handleDisable}
        isPending={isPending}
      />
    </>
  );
}
