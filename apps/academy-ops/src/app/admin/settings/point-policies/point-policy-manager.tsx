"use client";

import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import type { PointPolicyRow } from "./page";

type Props = {
  initialPolicies: PointPolicyRow[];
};

type PolicyForm = {
  name: string;
  description: string;
  defaultAmount: string;
  isActive: boolean;
};

const EMPTY_FORM: PolicyForm = {
  name: "",
  description: "",
  defaultAmount: "",
  isActive: true,
};

function formatAmount(amount: number) {
  return amount.toLocaleString("ko-KR") + "P";
}

export function PointPolicyManager({ initialPolicies }: Props) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM);
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

  function openEdit(policy: PointPolicyRow) {
    setEditingId(policy.id);
    setForm({
      name: policy.name,
      description: policy.description ?? "",
      defaultAmount: String(policy.defaultAmount),
      isActive: policy.isActive,
    });
    setError(null);
    setIsEditModalOpen(true);
  }

  function openDelete(id: number) {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/points/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          defaultAmount: Number(form.defaultAmount),
          isActive: form.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "등록 실패");
        return;
      }
      setPolicies((prev) => [
        ...prev,
        { ...data.policy, createdAt: data.policy.createdAt },
      ]);
      setIsCreateModalOpen(false);
    });
  }

  function handleEdit() {
    if (!editingId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/points/policies/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          defaultAmount: Number(form.defaultAmount),
          isActive: form.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "수정 실패");
        return;
      }
      setPolicies((prev) =>
        prev.map((p) =>
          p.id === editingId ? { ...p, ...data.policy, createdAt: p.createdAt } : p,
        ),
      );
      setIsEditModalOpen(false);
    });
  }

  function handleDelete() {
    if (!deletingId) return;
    startTransition(async () => {
      const res = await fetch(`/api/points/policies/${deletingId}`, { method: "DELETE" });
      if (!res.ok) return;
      setPolicies((prev) => prev.filter((p) => p.id !== deletingId));
      setIsDeleteModalOpen(false);
    });
  }

  const activePolicies = policies.filter((p) => p.isActive);
  const inactivePolicies = policies.filter((p) => !p.isActive);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">총 {policies.length}개 제도 ({activePolicies.length}개 활성)</p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
        >
          + 제도 추가
        </button>
      </div>

      {policies.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          등록된 포인트 제도가 없습니다. 제도를 추가하면 포인트 지급 시 빠르게 선택할 수 있습니다.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-5 py-3.5 font-semibold">제도명</th>
                <th className="px-5 py-3.5 font-semibold">설명</th>
                <th className="px-5 py-3.5 font-semibold">기본 지급량</th>
                <th className="px-5 py-3.5 font-semibold">상태</th>
                <th className="px-5 py-3.5 font-semibold text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {[...activePolicies, ...inactivePolicies].map((policy) => (
                <tr key={policy.id} className={policy.isActive ? "" : "opacity-50"}>
                  <td className="px-5 py-3.5 font-medium">{policy.name}</td>
                  <td className="px-5 py-3.5 text-slate">{policy.description ?? "-"}</td>
                  <td className="px-5 py-3.5 font-semibold text-forest">
                    {formatAmount(policy.defaultAmount)}
                  </td>
                  <td className="px-5 py-3.5">
                    {policy.isActive ? (
                      <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                        활성
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(policy)}
                      className="mr-3 text-xs font-semibold text-slate transition hover:text-ink"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => openDelete(policy.id)}
                      className="text-xs font-semibold text-ember transition hover:text-red-600"
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

      {/* 제도 추가 모달 */}
      <ActionModal
        open={isCreateModalOpen}
        badgeLabel="포인트 제도"
        title="포인트 제도 추가"
        description="새 포인트 제도를 등록합니다."
        confirmLabel="추가"
        cancelLabel="취소"
        onClose={() => setIsCreateModalOpen(false)}
        onConfirm={handleCreate}
        isPending={isPending}
      >
        <PolicyFormFields form={form} onChange={setForm} error={error} />
      </ActionModal>

      {/* 제도 수정 모달 */}
      <ActionModal
        open={isEditModalOpen}
        badgeLabel="포인트 제도"
        title="포인트 제도 수정"
        description="포인트 제도 정보를 수정합니다."
        confirmLabel="저장"
        cancelLabel="취소"
        onClose={() => setIsEditModalOpen(false)}
        onConfirm={handleEdit}
        isPending={isPending}
      >
        <PolicyFormFields form={form} onChange={setForm} error={error} showActiveToggle />
      </ActionModal>

      {/* 삭제 확인 모달 */}
      <ActionModal
        open={isDeleteModalOpen}
        badgeLabel="포인트 제도"
        title="포인트 제도 삭제"
        description="이 제도를 삭제하시겠습니까? 삭제 후에는 포인트 지급 시 선택 목록에서 제외됩니다."
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

function PolicyFormFields({
  form,
  onChange,
  error,
  showActiveToggle = false,
}: {
  form: PolicyForm;
  onChange: (form: PolicyForm) => void;
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
        <label className="block text-xs font-semibold text-slate mb-1.5">제도명 *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="예: 출석 우수 보상"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate mb-1.5">설명 (선택)</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="예: 해당 월 무단결시 0회인 학생에게 지급"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate mb-1.5">기본 지급량 (P) *</label>
        <input
          type="number"
          value={form.defaultAmount}
          onChange={(e) => onChange({ ...form, defaultAmount: e.target.value })}
          placeholder="예: 5000"
          min={0}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
        <p className="mt-1 text-xs text-slate">지급 시 자동 입력되며, 수동으로 변경 가능합니다.</p>
      </div>
      {showActiveToggle && (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="policy-isActive"
            checked={form.isActive}
            onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
            className="h-4 w-4 rounded"
          />
          <label htmlFor="policy-isActive" className="text-sm">활성 (포인트 지급 시 선택 목록에 표시)</label>
        </div>
      )}
    </div>
  );
}
