"use client";

import { AlertTriangle, LoaderCircle, Pencil, Save, Trash2, UserX } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "@/lib/sonner";

import type { DivisionStaffAccount } from "@/lib/services/division-staff.service";

type StaffManagerProps = {
  divisionSlug: string;
  initialStaff: DivisionStaffAccount[];
};

type StaffFormState = {
  email: string;
  password: string;
  name: string;
  role: "ADMIN" | "ASSISTANT";
  isActive: boolean;
};

type ConfirmModal = {
  type: "deactivate" | "delete";
  member: DivisionStaffAccount;
};

function toStaffFormState(staff?: DivisionStaffAccount | null): StaffFormState {
  return {
    email: staff?.email ?? "",
    password: "",
    name: staff?.name ?? "",
    role: staff?.role ?? "ASSISTANT",
    isActive: staff?.isActive ?? true,
  };
}

function getRoleLabel(role: "ADMIN" | "ASSISTANT") {
  return role === "ADMIN" ? "관리자" : "조교";
}

export function StaffManager({ divisionSlug, initialStaff }: StaffManagerProps) {
  const [staff, setStaff] = useState(initialStaff);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffFormState>(toStaffFormState());
  const [isSaving, setIsSaving] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);

  async function refreshStaff() {
    const response = await fetch(`/api/${divisionSlug}/admin/staff`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setStaff(data.staff);
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(toStaffFormState());
    setResetPasswordValue("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const url = editingId
        ? `/api/${divisionSlug}/admin/staff/${editingId}`
        : `/api/${divisionSlug}/admin/staff`;
      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? { name: form.name, role: form.role, isActive: form.isActive }
        : { email: form.email, password: form.password, name: form.name, role: form.role, isActive: form.isActive };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");

      toast.success(editingId ? "직원 정보를 수정했습니다." : "직원을 추가했습니다.");
      resetForm();
      await refreshStaff();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmAction() {
    if (!confirmModal) return;
    const { type, member } = confirmModal;
    setIsActioning(true);
    setConfirmModal(null);

    try {
      const url =
        type === "delete"
          ? `/api/${divisionSlug}/admin/staff/${member.id}?permanent=true`
          : `/api/${divisionSlug}/admin/staff/${member.id}`;

      const response = await fetch(url, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? (type === "delete" ? "삭제에 실패했습니다." : "비활성화에 실패했습니다."));
      }

      toast.success(
        type === "delete"
          ? `${member.name} 계정을 삭제했습니다.`
          : `${member.name} 계정을 비활성화했습니다.`,
      );
      if (editingId === member.id) resetForm();
      await refreshStaff();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "처리에 실패했습니다.");
    } finally {
      setIsActioning(false);
    }
  }

  async function handlePasswordReset(staffId: string) {
    if (!resetPasswordValue || resetPasswordValue.length < 8) {
      toast.error("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setIsResettingPassword(true);
    try {
      const response = await fetch(`/api/${divisionSlug}/admin/staff/${staffId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPasswordValue }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "비밀번호 변경에 실패했습니다.");
      toast.success("비밀번호를 변경했습니다.");
      setResetPasswordValue("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setIsResettingPassword(false);
    }
  }

  return (
    <>
      {confirmModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-rose-50">
              <AlertTriangle className="h-6 w-6 text-rose-600" />
            </div>

            <h3 className="admin-section-title">
              {confirmModal.type === "delete" ? "계정 영구 삭제" : "계정 비활성화"}
            </h3>

            <p className="admin-help mt-2 leading-6">
              <span className="font-semibold text-slate-900">{confirmModal.member.name}</span>{" "}
              {confirmModal.type === "delete" ? (
                <>
                  계정을 영구 삭제합니다.
                  <br />
                  <span className="text-rose-600">삭제된 계정과 데이터는 복구할 수 없습니다.</span>
                </>
              ) : (
                <>
                  계정을 비활성화합니다.
                  <br />
                  비활성화 후 로그인은 막히지만 계정 데이터는 유지됩니다.
                </>
              )}
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="admin-button flex-1"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={isActioning}
                className="admin-button admin-button-danger flex-1"
              >
                {isActioning ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : confirmModal.type === "delete" ? (
                  <Trash2 className="h-4 w-4" />
                ) : (
                  <UserX className="h-4 w-4" />
                )}
                {confirmModal.type === "delete" ? "영구 삭제" : "비활성화"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <section className="admin-section">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="admin-section-title">
                {editingId ? "직원 정보 수정" : "직원 추가"}
              </h3>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="admin-button"
            >
              초기화
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">이름</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                  className="w-full"
                  required
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">권한</span>
                <select
                  value={form.role}
                  onChange={(e) => setForm((c) => ({ ...c, role: e.target.value as "ADMIN" | "ASSISTANT" }))}
                  className="w-full"
                >
                  <option value="ADMIN">관리자</option>
                  <option value="ASSISTANT">조교</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">이메일</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:bg-slate-100"
                  disabled={Boolean(editingId)}
                  required={!editingId}
                />
              </label>
              {!editingId ? (
                <label className="block">
                  <span className="admin-label mb-2 block">초기 비밀번호</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))}
                    className="w-full"
                    required
                  />
                </label>
              ) : null}
            </div>

            <label className="inline-flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((c) => ({ ...c, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              로그인 가능한 활성 계정으로 유지
            </label>

            <button
              type="submit"
              disabled={isSaving}
              className="admin-button admin-button-primary w-full"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "직원 저장" : "직원 추가"}
            </button>
          </form>

          {editingId ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">비밀번호 재설정</p>
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  placeholder="새 비밀번호 (8자 이상)"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm transition"
                />
                <button
                  type="button"
                  disabled={isResettingPassword}
                  onClick={() => handlePasswordReset(editingId)}
                  className="admin-button"
                >
                  {isResettingPassword ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  변경
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="admin-section">
          <h3 className="admin-section-title">직원 목록</h3>

          <div className="mt-6 space-y-3">
            {staff.length === 0 ? (
              <p className="admin-help py-8 text-center">등록된 직원이 없습니다.</p>
            ) : (
              staff.map((member) => (
                <div key={member.id} className="admin-section">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="admin-section-title">{member.name}</h2>
                        <span className="rounded-lg bg-admin-accent px-2.5 py-1 text-xs font-semibold text-white">
                          {getRoleLabel(member.role)}
                        </span>
                        {!member.isActive ? (
                          <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700">
                            비활성
                          </span>
                        ) : null}
                      </div>
                      <p className="admin-help mt-2">{member.email ?? "이메일 없음"}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(member.id);
                          setForm(toStaffFormState(member));
                          setResetPasswordValue("");
                        }}
                        className="admin-button"
                      >
                        <Pencil className="h-4 w-4" />
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmModal({ type: "deactivate", member })}
                        disabled={isActioning}
                        className="admin-button"
                      >
                        <UserX className="h-4 w-4" />
                        비활성화
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmModal({ type: "delete", member })}
                        disabled={isActioning}
                        className="admin-button admin-button-danger-outline"
                      >
                        <Trash2 className="h-4 w-4" />
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}
