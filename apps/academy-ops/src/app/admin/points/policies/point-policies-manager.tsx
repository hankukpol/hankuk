"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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

export function PointPoliciesManager({ initialPolicies }: Props) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<PolicyForm>(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, startAdd] = useTransition();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PolicyForm>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditing, startEdit] = useTransition();

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const [isToggling, startToggle] = useTransition();

  function openAdd() {
    setAddForm(EMPTY_FORM);
    setAddError(null);
    setShowAddForm(true);
    setEditingId(null);
  }

  function cancelAdd() {
    setShowAddForm(false);
    setAddError(null);
  }

  function openEdit(policy: PointPolicyRow) {
    setEditingId(policy.id);
    setEditForm({
      name: policy.name,
      description: policy.description ?? "",
      defaultAmount: String(policy.defaultAmount),
      isActive: policy.isActive,
    });
    setEditError(null);
    setShowAddForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  function handleAdd() {
    if (!addForm.name.trim()) {
      setAddError("정책명을 입력해주세요.");
      return;
    }
    const amt = Number(addForm.defaultAmount);
    if (!addForm.defaultAmount || isNaN(amt) || amt < 0) {
      setAddError("기본 지급량을 올바르게 입력해주세요.");
      return;
    }
    setAddError(null);
    startAdd(async () => {
      const res = await fetch("/api/points/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name.trim(),
          description: addForm.description.trim() || null,
          defaultAmount: amt,
          isActive: addForm.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "등록 실패");
        return;
      }
      setPolicies((prev) => [...prev, { ...data.policy, createdAt: data.policy.createdAt }]);
      setShowAddForm(false);
      toast.success("정책이 추가되었습니다.");
    });
  }

  function handleEdit() {
    if (!editingId) return;
    if (!editForm.name.trim()) {
      setEditError("정책명을 입력해주세요.");
      return;
    }
    const amt = Number(editForm.defaultAmount);
    if (!editForm.defaultAmount || isNaN(amt) || amt < 0) {
      setEditError("기본 지급량을 올바르게 입력해주세요.");
      return;
    }
    setEditError(null);
    startEdit(async () => {
      const res = await fetch(`/api/points/policies/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim() || null,
          defaultAmount: amt,
          isActive: editForm.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "수정 실패");
        return;
      }
      setPolicies((prev) =>
        prev.map((p) =>
          p.id === editingId ? { ...p, ...data.policy, createdAt: p.createdAt } : p,
        ),
      );
      setEditingId(null);
      toast.success("정책이 수정되었습니다.");
    });
  }

  function handleToggle(policy: PointPolicyRow) {
    startToggle(async () => {
      const res = await fetch(`/api/points/policies/${policy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !policy.isActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "상태 변경 실패");
        return;
      }
      setPolicies((prev) =>
        prev.map((p) =>
          p.id === policy.id ? { ...p, isActive: !policy.isActive } : p,
        ),
      );
      toast.success(policy.isActive ? "정책이 비활성화되었습니다." : "정책이 활성화되었습니다.");
    });
  }

  function handleDelete(id: number) {
    setDeletingId(id);
  }

  function confirmDelete() {
    if (!deletingId) return;
    startDelete(async () => {
      const res = await fetch(`/api/points/policies/${deletingId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "삭제 실패");
        setDeletingId(null);
        return;
      }
      setPolicies((prev) => prev.filter((p) => p.id !== deletingId));
      setDeletingId(null);
      toast.success("정책이 삭제되었습니다.");
    });
  }

  const sortedPolicies = [
    ...policies.filter((p) => p.isActive),
    ...policies.filter((p) => !p.isActive),
  ];

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          총 {policies.length}개 정책 ({policies.filter((p) => p.isActive).length}개 활성)
        </p>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
        >
          + 정책 추가
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink">새 정책 추가</h2>
          <PolicyFormFields form={addForm} onChange={setAddForm} error={addError} />
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelAdd}
              disabled={isAdding}
              className="rounded-full border border-ink/10 bg-white px-5 py-2 text-sm font-medium text-slate transition hover:bg-mist disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding}
              className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest/80 disabled:opacity-50"
            >
              {isAdding ? "추가 중…" : "추가"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {policies.length === 0 && !showAddForm ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          등록된 포인트 정책이 없습니다. 정책을 추가하면 포인트 지급 시 빠르게 선택할 수 있습니다.
        </div>
      ) : policies.length > 0 ? (
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-5 py-3.5 font-semibold text-ink">정책명</th>
                <th className="px-5 py-3.5 font-semibold text-ink">설명</th>
                <th className="px-5 py-3.5 font-semibold text-ink">기본지급량</th>
                <th className="px-5 py-3.5 font-semibold text-ink">상태</th>
                <th className="px-5 py-3.5 font-semibold text-ink text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {sortedPolicies.map((policy) => (
                <>
                  <tr
                    key={policy.id}
                    className={`transition-colors hover:bg-mist/40 ${
                      !policy.isActive ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-5 py-3.5 font-medium text-ink">{policy.name}</td>
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
                        <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">
                          비활성
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openEdit(policy)}
                          className="text-xs font-semibold text-slate transition hover:text-ink"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(policy)}
                          disabled={isToggling}
                          className="text-xs font-semibold text-slate transition hover:text-forest disabled:opacity-40"
                        >
                          {policy.isActive ? "비활성화" : "활성화"}
                        </button>
                        {deletingId === policy.id ? (
                          <span className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={confirmDelete}
                              disabled={isDeleting}
                              className="text-xs font-semibold text-red-600 transition hover:text-red-700 disabled:opacity-40"
                            >
                              {isDeleting ? "삭제 중…" : "확인"}
                            </button>
                            <span className="text-xs text-ink/30">|</span>
                            <button
                              type="button"
                              onClick={() => setDeletingId(null)}
                              className="text-xs font-semibold text-slate transition hover:text-ink"
                            >
                              취소
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDelete(policy.id)}
                            className="text-xs font-semibold text-ember transition hover:text-red-600"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Inline edit row */}
                  {editingId === policy.id && (
                    <tr key={`edit-${policy.id}`} className="bg-mist/60">
                      <td colSpan={5} className="px-5 py-5">
                        <div className="max-w-xl">
                          <h3 className="mb-4 text-xs font-semibold text-slate">정책 수정</h3>
                          <PolicyFormFields
                            form={editForm}
                            onChange={setEditForm}
                            error={editError}
                            showActiveToggle
                          />
                          <div className="mt-4 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isEditing}
                              className="rounded-full border border-ink/10 bg-white px-5 py-2 text-sm font-medium text-slate transition hover:bg-mist disabled:opacity-50"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={handleEdit}
                              disabled={isEditing}
                              className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest/80 disabled:opacity-50"
                            >
                              {isEditing ? "저장 중…" : "저장"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">정책명 *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="예: 출석 우수 보상"
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">기본 지급량 (P) *</label>
          <div className="relative">
            <input
              type="number"
              value={form.defaultAmount}
              onChange={(e) => onChange({ ...form, defaultAmount: e.target.value })}
              placeholder="예: 5000"
              min={0}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate">
              포인트
            </span>
          </div>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">설명 (선택)</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="예: 해당 월 무단결시 0회인 학생에게 지급"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
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
          <label htmlFor="policy-isActive" className="text-sm text-ink">
            활성 (포인트 지급 시 선택 목록에 표시)
          </label>
        </div>
      )}
    </div>
  );
}
