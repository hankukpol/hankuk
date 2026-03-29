"use client";

import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import type { DiscountCodeRow } from "./page";

type Props = {
  initialCodes: DiscountCodeRow[];
};

type CodeForm = {
  code: string;
  type: "REFERRAL" | "ENROLLMENT" | "CAMPAIGN";
  discountType: "RATE" | "FIXED";
  discountValue: string;
  maxUsage: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
};

const today = new Date().toISOString().split("T")[0];

const EMPTY_FORM: CodeForm = {
  code: "",
  type: "CAMPAIGN",
  discountType: "FIXED",
  discountValue: "",
  maxUsage: "",
  validFrom: today,
  validUntil: "",
  isActive: true,
};

const CODE_TYPE_LABELS: Record<"REFERRAL" | "ENROLLMENT" | "CAMPAIGN", string> = {
  REFERRAL: "추천인",
  ENROLLMENT: "입소",
  CAMPAIGN: "캠페인",
};

const CODE_TYPE_COLORS: Record<"REFERRAL" | "ENROLLMENT" | "CAMPAIGN", string> = {
  REFERRAL: "border-forest/20 bg-forest/10 text-forest",
  ENROLLMENT: "border-ember/20 bg-ember/10 text-ember",
  CAMPAIGN: "border-blue-200 bg-blue-50 text-blue-700",
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return iso.replace(/-/g, ".");
}

function formatDiscount(row: DiscountCodeRow) {
  if (row.discountType === "FIXED") {
    return `${row.discountValue.toLocaleString()}원`;
  }
  return `${row.discountValue}%`;
}

export function DiscountCodeManager({ initialCodes }: Props) {
  const [codes, setCodes] = useState(initialCodes);
  const [form, setForm] = useState<CodeForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setIsCreateModalOpen(true);
  }

  function openEdit(row: DiscountCodeRow) {
    setEditingId(row.id);
    setForm({
      code: row.code,
      type: row.type,
      discountType: row.discountType,
      discountValue: String(row.discountValue),
      maxUsage: row.maxUsage !== null ? String(row.maxUsage) : "",
      validFrom: row.validFrom,
      validUntil: row.validUntil ?? "",
      isActive: row.isActive,
    });
    setError(null);
    setIsEditModalOpen(true);
  }

  function openDelete(id: number) {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  }

  function buildPayload(f: CodeForm) {
    return {
      code: f.code,
      type: f.type,
      discountType: f.discountType,
      discountValue: Number(f.discountValue),
      maxUsage: f.maxUsage ? Number(f.maxUsage) : null,
      validFrom: f.validFrom,
      validUntil: f.validUntil || null,
      isActive: f.isActive,
    };
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/settings/discount-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "등록 실패");
        return;
      }
      const c = data.code;
      setCodes((prev) => [
        {
          ...c,
          validFrom: c.validFrom.split("T")[0],
          validUntil: c.validUntil ? c.validUntil.split("T")[0] : null,
          staffName: c.staff?.name ?? "-",
        },
        ...prev,
      ]);
      setIsCreateModalOpen(false);
    });
  }

  function handleEdit() {
    if (!editingId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/settings/discount-codes/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "수정 실패");
        return;
      }
      const c = data.code;
      setCodes((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? {
                ...r,
                ...c,
                validFrom: c.validFrom.split("T")[0],
                validUntil: c.validUntil ? c.validUntil.split("T")[0] : null,
                staffName: c.staff?.name ?? r.staffName,
              }
            : r,
        ),
      );
      setIsEditModalOpen(false);
    });
  }

  function handleDelete() {
    if (!deletingId) return;
    startTransition(async () => {
      const res = await fetch(`/api/settings/discount-codes/${deletingId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "삭제 실패");
        setIsDeleteModalOpen(false);
        return;
      }
      setCodes((prev) => prev.filter((r) => r.id !== deletingId));
      setIsDeleteModalOpen(false);
    });
  }

  const activeCodes = codes.filter((c) => c.isActive);
  const inactiveCodes = codes.filter((c) => !c.isActive);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          총 {codes.length}개 코드 ({activeCodes.length}개 활성)
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
        >
          + 코드 발급
        </button>
      </div>

      {codes.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          발급된 할인 코드가 없습니다.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-5 py-3.5 font-semibold">코드</th>
                <th className="px-5 py-3.5 font-semibold">유형</th>
                <th className="px-5 py-3.5 font-semibold">할인</th>
                <th className="px-5 py-3.5 font-semibold">사용</th>
                <th className="px-5 py-3.5 font-semibold">유효기간</th>
                <th className="px-5 py-3.5 font-semibold">상태</th>
                <th className="px-5 py-3.5 font-semibold">발급자</th>
                <th className="px-5 py-3.5 font-semibold text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {[...activeCodes, ...inactiveCodes].map((row) => (
                <tr key={row.id} className={row.isActive ? "" : "opacity-50"}>
                  <td className="px-5 py-3.5 font-mono font-semibold tracking-wider">
                    {row.code}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CODE_TYPE_COLORS[row.type]}`}
                    >
                      {CODE_TYPE_LABELS[row.type]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-ember">{formatDiscount(row)}</td>
                  <td className="px-5 py-3.5 text-slate">
                    {row.usageCount}
                    {row.maxUsage !== null ? ` / ${row.maxUsage}` : ""}회
                  </td>
                  <td className="px-5 py-3.5 text-slate">
                    {formatDate(row.validFrom)}
                    {row.validUntil ? ` ~ ${formatDate(row.validUntil)}` : " ~"}
                  </td>
                  <td className="px-5 py-3.5">
                    {row.isActive ? (
                      <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                        활성
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate">{row.staffName}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="mr-3 text-xs font-semibold text-slate transition hover:text-ink"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => openDelete(row.id)}
                      disabled={row.usageCount > 0}
                      className="text-xs font-semibold text-ember transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 코드 발급 모달 */}
      <ActionModal
        open={isCreateModalOpen}
        badgeLabel="할인 코드"
        title="할인 코드 발급"
        description="새 할인 코드를 발급합니다."
        confirmLabel="발급"
        cancelLabel="취소"
        onClose={() => setIsCreateModalOpen(false)}
        onConfirm={handleCreate}
        isPending={isPending}
      >
        <CodeFormFields form={form} onChange={setForm} error={error} />
      </ActionModal>

      {/* 코드 수정 모달 */}
      <ActionModal
        open={isEditModalOpen}
        badgeLabel="할인 코드"
        title="할인 코드 수정"
        description="할인 코드 정보를 수정합니다."
        confirmLabel="저장"
        cancelLabel="취소"
        onClose={() => setIsEditModalOpen(false)}
        onConfirm={handleEdit}
        isPending={isPending}
      >
        <CodeFormFields form={form} onChange={setForm} error={error} showActiveToggle />
      </ActionModal>

      {/* 삭제 확인 모달 */}
      <ActionModal
        open={isDeleteModalOpen}
        badgeLabel="할인 코드"
        title="할인 코드 삭제"
        description="이 할인 코드를 삭제하시겠습니까? 한 번도 사용되지 않은 코드만 삭제 가능합니다."
        confirmLabel="삭제"
        cancelLabel="취소"
        confirmTone="danger"
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}

function CodeFormFields({
  form,
  onChange,
  error,
  showActiveToggle = false,
}: {
  form: CodeForm;
  onChange: (form: CodeForm) => void;
  error: string | null;
  showActiveToggle?: boolean;
}) {
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">코드 *</label>
        <input
          type="text"
          value={form.code}
          onChange={(e) => onChange({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="예: POLICE2026, REF-HONG"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-mono text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
        <p className="mt-1 text-xs text-slate">영문 대문자, 숫자, 하이픈 조합 권장</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">코드 유형 *</label>
          <select
            value={form.type}
            onChange={(e) =>
              onChange({ ...form, type: e.target.value as "REFERRAL" | "ENROLLMENT" | "CAMPAIGN" })
            }
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          >
            <option value="CAMPAIGN">캠페인</option>
            <option value="REFERRAL">추천인</option>
            <option value="ENROLLMENT">입소</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">최대 사용 횟수</label>
          <input
            type="number"
            value={form.maxUsage}
            onChange={(e) => onChange({ ...form, maxUsage: e.target.value })}
            placeholder="비워두면 무제한"
            min={1}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">할인 방식 *</label>
          <select
            value={form.discountType}
            onChange={(e) =>
              onChange({ ...form, discountType: e.target.value as "RATE" | "FIXED" })
            }
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          >
            <option value="FIXED">고정액 (원)</option>
            <option value="RATE">퍼센트 (%)</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">
            할인 값 * {form.discountType === "FIXED" ? "(원)" : "(%)"}
          </label>
          <input
            type="number"
            value={form.discountValue}
            onChange={(e) => onChange({ ...form, discountValue: e.target.value })}
            placeholder={form.discountType === "FIXED" ? "예: 50000" : "예: 10"}
            min={1}
            max={form.discountType === "RATE" ? 100 : undefined}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">유효 시작일 *</label>
          <input
            type="date"
            value={form.validFrom}
            onChange={(e) => onChange({ ...form, validFrom: e.target.value })}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">유효 종료일</label>
          <input
            type="date"
            value={form.validUntil}
            onChange={(e) => onChange({ ...form, validUntil: e.target.value })}
            placeholder="비워두면 무기한"
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
      </div>
      {showActiveToggle && (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="code-isActive"
            checked={form.isActive}
            onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
            className="h-4 w-4 rounded"
          />
          <label htmlFor="code-isActive" className="text-sm">
            활성 (수납 시 코드 적용 가능)
          </label>
        </div>
      )}
    </div>
  );
}
