"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";

type TextbookRecord = {
  id: number;
  title: string;
  author: string | null;
  publisher: string | null;
  price: number;
  stock: number;
  subject: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type TextbookManagerProps = { initialTextbooks: TextbookRecord[] };

type ActiveFilter = "ALL" | "ACTIVE" | "INACTIVE";

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형소법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

const SUBJECT_KEYS = Object.keys(SUBJECT_LABELS);

type FormState = {
  title: string;
  author: string;
  publisher: string;
  price: string;
  stock: string;
  subject: string;
  isActive: boolean;
};

const DEFAULT_FORM: FormState = {
  title: "",
  author: "",
  publisher: "",
  price: "",
  stock: "0",
  subject: "",
  isActive: true,
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

export function TextbookManager({ initialTextbooks }: TextbookManagerProps) {
  const [textbooks, setTextbooks] = useState<TextbookRecord[]>(initialTextbooks);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("ALL");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Stock adjustment modal state
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockTargetId, setStockTargetId] = useState<number | null>(null);
  const [stockTargetTitle, setStockTargetTitle] = useState<string>("");
  const [stockAdjustValue, setStockAdjustValue] = useState<string>("");
  const [stockModalError, setStockModalError] = useState<string | null>(null);

  const confirmModal = useActionModalState();

  const filteredTextbooks = textbooks.filter((t) => {
    if (activeFilter === "ACTIVE") return t.isActive;
    if (activeFilter === "INACTIVE") return !t.isActive;
    return true;
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function openEdit(textbook: TextbookRecord) {
    setEditingId(textbook.id);
    setForm({
      title: textbook.title,
      author: textbook.author ?? "",
      publisher: textbook.publisher ?? "",
      price: String(textbook.price),
      stock: String(textbook.stock),
      subject: textbook.subject ?? "",
      isActive: textbook.isActive,
    });
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setErrorMessage(null);
  }

  function handleSave() {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        const body = {
          title: form.title,
          author: form.author || null,
          publisher: form.publisher || null,
          price: form.price === "" ? 0 : Number(form.price),
          stock: form.stock === "" ? 0 : Number(form.stock),
          subject: form.subject || null,
          isActive: form.isActive,
        };

        if (editingId !== null) {
          const result = await requestJson<{ textbook: TextbookRecord }>(
            `/api/textbooks/${editingId}`,
            { method: "PATCH", body: JSON.stringify(body) },
          );
          setTextbooks((prev) =>
            prev.map((t) => (t.id === editingId ? result.textbook : t)),
          );
          setSuccessMessage("교재를 수정했습니다.");
        } else {
          const result = await requestJson<{ textbook: TextbookRecord }>("/api/textbooks", {
            method: "POST",
            body: JSON.stringify(body),
          });
          setTextbooks((prev) => [result.textbook, ...prev]);
          setSuccessMessage("교재를 추가했습니다.");
        }

        closeForm();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  function handleDelete(textbook: TextbookRecord) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: `교재 삭제: ${textbook.title}`,
      description: "이 교재를 삭제하시겠습니까? 삭제한 교재는 다시 복구할 수 없습니다.",
      details: [
        `교재명: ${textbook.title}`,
        ...(textbook.author ? [`저자: ${textbook.author}`] : []),
        `가격: ${textbook.price.toLocaleString()}원`,
        `재고: ${textbook.stock}개`,
      ],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setSuccessMessage(null);
        setErrorMessage(null);

        startTransition(async () => {
          try {
            await requestJson<{ success: true }>(`/api/textbooks/${textbook.id}`, {
              method: "DELETE",
            });
            setTextbooks((prev) => prev.filter((t) => t.id !== textbook.id));
            setSuccessMessage("교재를 삭제했습니다.");
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : "삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  function openStockModal(textbook: TextbookRecord) {
    setStockTargetId(textbook.id);
    setStockTargetTitle(textbook.title);
    setStockAdjustValue("");
    setStockModalError(null);
    setStockModalOpen(true);
  }

  function closeStockModal() {
    setStockModalOpen(false);
    setStockTargetId(null);
    setStockTargetTitle("");
    setStockAdjustValue("");
    setStockModalError(null);
  }

  function handleStockAdjust() {
    if (!stockTargetId) return;
    const adjustNum = Number(stockAdjustValue);
    if (stockAdjustValue === "" || isNaN(adjustNum) || adjustNum === 0) {
      setStockModalError("0이 아닌 정수를 입력하세요. 양수는 증가, 음수는 감소입니다.");
      return;
    }

    setStockModalError(null);

    startTransition(async () => {
      try {
        const result = await requestJson<{ textbook: TextbookRecord }>(
          `/api/textbooks/${stockTargetId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ stockAdjust: adjustNum }),
          },
        );
        setTextbooks((prev) =>
          prev.map((t) => (t.id === stockTargetId ? result.textbook : t)),
        );
        setSuccessMessage(
          `재고를 조정했습니다. (${adjustNum > 0 ? "+" : ""}${adjustNum}개 → 현재 ${result.textbook.stock}개)`,
        );
        closeStockModal();
      } catch (error) {
        setStockModalError(
          error instanceof Error ? error.message : "재고 조정에 실패했습니다.",
        );
      }
    });
  }

  const activeFilters: Array<{ value: ActiveFilter; label: string }> = [
    { value: "ALL", label: "전체" },
    { value: "ACTIVE", label: "활성" },
    { value: "INACTIVE", label: "비활성" },
  ];

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1">
          {activeFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setActiveFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeFilter === f.value
                  ? "bg-ink text-white"
                  : "border border-ink/10 bg-white text-slate hover:border-ink/30"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings/textbooks/sales"
            className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ember"
          >
            매출 현황
          </Link>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            <span>+</span>
            <span>새 교재 추가</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {successMessage ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {successMessage}
        </div>
      ) : null}
      {errorMessage && !isFormOpen ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead>
            <tr>
              {["교재명", "저자", "출판사", "과목", "가격", "재고", "상태", "액션"].map(
                (header) => (
                  <th
                    key={header}
                    className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {filteredTextbooks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate">
                  조건에 맞는 교재가 없습니다.
                </td>
              </tr>
            ) : null}
            {filteredTextbooks.map((textbook) => (
              <tr key={textbook.id} className="transition hover:bg-mist/30">
                <td className="px-4 py-3 font-medium text-ink">{textbook.title}</td>
                <td className="px-4 py-3 text-slate">{textbook.author ?? "-"}</td>
                <td className="px-4 py-3 text-slate">{textbook.publisher ?? "-"}</td>
                <td className="px-4 py-3 text-slate">
                  {textbook.subject ? (SUBJECT_LABELS[textbook.subject] ?? textbook.subject) : "-"}
                </td>
                <td className="px-4 py-3 tabular-nums text-ink">
                  {textbook.price.toLocaleString()}원
                </td>
                <td className="px-4 py-3 tabular-nums text-ink">
                  <span
                    className={
                      textbook.stock === 0 ? "font-semibold text-red-600" : ""
                    }
                  >
                    {textbook.stock}개
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      textbook.isActive
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {textbook.isActive ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/settings/textbooks/${textbook.id}`}
                      className="inline-flex items-center rounded-full border border-forest/20 px-3 py-1 text-xs font-semibold text-forest transition hover:border-forest/50 hover:bg-forest/5"
                    >
                      상세
                    </Link>
                    <button
                      type="button"
                      onClick={() => openStockModal(textbook)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-forest/30 hover:text-forest disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      재고 조정
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(textbook)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(textbook)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      <ActionModal
        open={isFormOpen}
        badgeLabel={editingId !== null ? "교재 수정" : "교재 추가"}
        badgeTone="default"
        title={editingId !== null ? "교재 수정" : "새 교재 추가"}
        description={
          editingId !== null
            ? "교재 정보를 수정합니다."
            : "새 교재를 등록합니다. 교재명과 가격은 필수 항목입니다."
        }
        panelClassName="max-w-lg"
        cancelLabel="취소"
        confirmLabel={isPending ? "저장 중..." : editingId !== null ? "수정 저장" : "교재 추가"}
        isPending={isPending}
        onClose={closeForm}
        onConfirm={handleSave}
      >
        <div className="space-y-4">
          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {/* 교재명 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              교재명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="예: 2026 경찰학 기본서"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* 저자 + 출판사 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">저자</label>
              <input
                type="text"
                value={form.author}
                onChange={(e) => setField("author", e.target.value)}
                placeholder="예: 홍길동"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">출판사</label>
              <input
                type="text"
                value={form.publisher}
                onChange={(e) => setField("publisher", e.target.value)}
                placeholder="예: 경찰고시사"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {/* 가격 + 재고 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                가격 (원) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setField("price", e.target.value)}
                placeholder="예: 25000"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                재고 (개) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setField("stock", e.target.value)}
                placeholder="예: 50"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {/* 과목 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">관련 과목</label>
            <select
              value={form.subject}
              onChange={(e) => setField("subject", e.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            >
              <option value="">일반 (과목 무관)</option>
              {SUBJECT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SUBJECT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {/* 활성 여부 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setField("isActive", !form.isActive)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                form.isActive ? "bg-forest" : "bg-slate-200"
              }`}
              role="switch"
              aria-checked={form.isActive}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  form.isActive ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <label className="text-sm font-medium">
              {form.isActive ? "활성 (판매 중)" : "비활성 (판매 중단)"}
            </label>
          </div>
        </div>
      </ActionModal>

      {/* Stock adjustment modal */}
      <ActionModal
        open={stockModalOpen}
        badgeLabel="재고 조정"
        badgeTone="default"
        title="재고 수량 조정"
        description={`"${stockTargetTitle}" 교재의 재고를 조정합니다. 양수는 재고 증가, 음수는 재고 감소입니다.`}
        panelClassName="max-w-sm"
        cancelLabel="취소"
        confirmLabel={isPending ? "처리 중..." : "조정 적용"}
        isPending={isPending}
        onClose={closeStockModal}
        onConfirm={handleStockAdjust}
      >
        <div className="space-y-3">
          {stockModalError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {stockModalError}
            </div>
          ) : null}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              조정 수량 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={stockAdjustValue}
              onChange={(e) => setStockAdjustValue(e.target.value)}
              placeholder="예: +10 또는 -5"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
            <p className="mt-1.5 text-xs text-slate">
              양수(+): 재고 추가 &nbsp;|&nbsp; 음수(-): 재고 차감 (최소 0개)
            </p>
          </div>
        </div>
      </ActionModal>

      {/* Delete confirm modal */}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}
