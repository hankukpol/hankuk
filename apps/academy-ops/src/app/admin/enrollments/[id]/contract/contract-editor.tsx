"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

export type ContractItem = { label: string; amount: number };

export type ContractData = {
  id: string;
  enrollmentId: string;
  items: ContractItem[];
  note: string | null;
  issuedAt: string;
  printedAt: string | null;
  privacyConsentedAt: string | null;
};

type Props = {
  enrollmentId: string;
  initial: ContractData;
  studentNotificationConsent: boolean;
  studentNotificationConsentedAt: string | null;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "요청을 처리하지 못했습니다.");
  }

  return payload as T;
}

function buildFeeRowsHtml(items: ContractItem[]) {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="border:1px solid #E5E7EB;padding:6px 12px">${item.label}</td>
          <td style="border:1px solid #E5E7EB;padding:6px 12px;text-align:right">${item.amount.toLocaleString()}원</td>
        </tr>`,
    )
    .join("");

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return `${rows}
    <tr style="background:#F9FAFB;font-weight:600">
      <td style="border:1px solid #E5E7EB;padding:6px 12px">합계</td>
      <td style="border:1px solid #E5E7EB;padding:6px 12px;text-align:right">${total.toLocaleString()}원</td>
    </tr>`;
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContractEditor({
  enrollmentId,
  initial,
  studentNotificationConsent,
  studentNotificationConsentedAt,
}: Props) {
  const searchParams = useSearchParams();
  const autoPrintHandledRef = useRef(false);
  const [items, setItems] = useState<ContractItem[]>(initial.items);
  const [note, setNote] = useState(initial.note ?? "");
  const [printedAt, setPrintedAt] = useState<string | null>(initial.printedAt);
  const [privacyConsentGiven, setPrivacyConsentGiven] = useState(Boolean(initial.privacyConsentedAt));
  const [privacyConsentedAt, setPrivacyConsentedAt] = useState<string | null>(initial.privacyConsentedAt);
  const [isSaving, startSave] = useTransition();
  const [isPrinting, startPrint] = useTransition();

  const apiBase = `/api/contracts/enrollment/${enrollmentId}`;

  function updateItem(index: number, field: keyof ContractItem, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: field === "amount" ? Number(value) || 0 : value,
      };
      return next;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, { label: "", amount: 0 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function syncPreviewDom(nextPrivacyConsentedAt: string | null) {
    const tbody = document.getElementById("contract-fee-tbody");
    if (tbody) {
      tbody.innerHTML = buildFeeRowsHtml(items);
    }

    const noteSection = document.getElementById("contract-note-section");
    const noteParagraph = document.getElementById("contract-note-text");
    if (noteSection && noteParagraph) {
      if (note.trim()) {
        noteSection.style.display = "";
        noteParagraph.textContent = note.trim();
      } else {
        noteSection.style.display = "none";
        noteParagraph.textContent = "";
      }
    }

    const privacyStatus = document.getElementById("contract-privacy-required-status");
    const privacyDate = document.getElementById("contract-privacy-required-date");
    if (privacyStatus) {
      privacyStatus.textContent = nextPrivacyConsentedAt ? "동의 완료" : "동의 기록 필요";
      privacyStatus.className = nextPrivacyConsentedAt
        ? "rounded-full bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest"
        : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700";
    }
    if (privacyDate) {
      privacyDate.textContent = nextPrivacyConsentedAt
        ? `기록 시각: ${formatDateLabel(nextPrivacyConsentedAt)}`
        : "필수 동의가 기록되지 않았습니다.";
    }
  }

  function handleSave() {
    startSave(async () => {
      try {
        const response = await requestJson<{ data: { contract: ContractData } }>(apiBase, {
          method: "PATCH",
          body: JSON.stringify({
            items,
            note: note.trim() || null,
            privacyConsentGiven,
          }),
        });

        const nextPrivacyConsentedAt = response.data.contract.privacyConsentedAt;
        setPrivacyConsentedAt(nextPrivacyConsentedAt);
        syncPreviewDom(nextPrivacyConsentedAt);
        toast.success("계약서가 저장되었습니다.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "계약서 저장에 실패했습니다.");
      }
    });
  }

  function handlePrint() {
    startPrint(async () => {
      if (!privacyConsentGiven) {
        toast.error("개인정보 수집·이용 동의를 확인한 뒤 계약서를 출력해 주세요.");
        return;
      }

      try {
        const response = await requestJson<{ data: { printedAt: string } }>(`${apiBase}/print`, {
          method: "POST",
        });
        setPrintedAt(response.data.printedAt);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "출력 기록 저장에 실패했습니다.");
      }

      syncPreviewDom(privacyConsentedAt ?? new Date().toISOString());
      window.print();
    });
  }

  useEffect(() => {
    if (searchParams.get("autoPrint") !== "1") {
      return;
    }
    if (autoPrintHandledRef.current || !privacyConsentGiven) {
      return;
    }

    autoPrintHandledRef.current = true;
    handlePrint();
  }, [searchParams, privacyConsentGiven]);

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="border-b bg-white px-6 py-5 print:hidden">
      <div className="mx-auto max-w-3xl">
        <div className="space-y-5 rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">수강 계약서 편집</h2>
              <p className="mt-1 text-sm text-[#4B5563]">
                계약 항목과 특약 사항을 수정하고, 필수 개인정보 동의 기록을 함께 관리합니다.
              </p>
            </div>
            {printedAt ? (
              <span className="rounded-full bg-[#1F4D3A]/10 px-3 py-1 text-xs font-semibold text-[#1F4D3A]">
                출력 완료 · {new Date(printedAt).toLocaleDateString("ko-KR")}
              </span>
            ) : null}
          </div>

          <div className="rounded-[20px] border border-ink/10 bg-mist/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">필수 개인정보 수집·이용 동의</p>
                <p className="mt-1 text-xs leading-6 text-slate">
                  수강 등록과 계약서 발급의 필수 기록입니다. 동의 없이 계약서를 출력할 수 없습니다.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={privacyConsentGiven}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setPrivacyConsentGiven(checked);
                    setPrivacyConsentedAt(checked ? privacyConsentedAt ?? new Date().toISOString() : null);
                  }}
                  className="h-4 w-4 rounded border-ink/20 text-forest focus:ring-forest/30"
                />
                개인정보 수집·이용 동의 확인
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate">
              <span>필수 동의 기록: {privacyConsentedAt ? formatDateLabel(privacyConsentedAt) : "미기록"}</span>
              <span>
                선택 알림 수신 동의: {studentNotificationConsent ? "동의" : "미동의"}
                {studentNotificationConsentedAt ? ` · ${formatDateLabel(studentNotificationConsentedAt)}` : ""}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1 text-xs font-semibold text-[#4B5563]">
              <span className="flex-1">항목명</span>
              <span className="w-36 text-right">금액(원)</span>
              <span className="w-7" />
            </div>
            {items.map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.label}
                  onChange={(event) => updateItem(index, "label", event.target.value)}
                  placeholder="예: 2026 공채 종합반 52기"
                  className="flex-1 rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
                <input
                  type="number"
                  value={item.amount || ""}
                  onChange={(event) => updateItem(index, "amount", event.target.value)}
                  placeholder="금액"
                  className="w-36 rounded-xl border border-[#D1D5DB] px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="flex h-7 w-7 items-center justify-center text-lg leading-none text-red-400 transition hover:text-red-600"
                  title="항목 삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={addItem}
              className="text-sm font-medium text-[#C55A11] transition hover:text-[#A04810]"
            >
              + 계약 항목 추가
            </button>
            <span className="text-sm font-semibold text-[#111827]">합계: {total.toLocaleString()}원</span>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#4B5563]">
              특약 사항 <span className="font-normal text-[#9CA3AF]">(선택)</span>
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="특약 사항이 있으면 입력해 주세요."
              className="w-full resize-none rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-xl bg-[#1F4D3A] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#173d2e] disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="rounded-xl bg-[#C55A11] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#A04810] disabled:opacity-50"
            >
              {isPrinting ? "준비 중..." : "인쇄 / PDF 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
