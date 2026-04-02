"use client";

import { LoaderCircle, Pencil, RefreshCcw, Save, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "@/lib/sonner";

import type {
  ManagedAdminAccount,
  ManagedDivision,
} from "@/lib/services/super-admin.service";

type SuperAdminManagerProps = {
  initialDivisions: ManagedDivision[];
  initialAdmins: ManagedAdminAccount[];
};

type DivisionFormState = {
  name: string;
  slug: string;
  fullName: string;
  color: string;
  displayOrder: string;
  isActive: boolean;
  copyFromSlug: string;
};

type AdminFormState = {
  email: string;
  password: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  divisionSlug: string;
  isActive: boolean;
};

function toDivisionFormState(division?: ManagedDivision | null): DivisionFormState {
  return {
    name: division?.name ?? "",
    slug: division?.slug ?? "",
    fullName: division?.fullName ?? "",
    color: division?.color ?? "#1B4FBB",
    displayOrder: division ? String(division.displayOrder) : "0",
    isActive: division?.isActive ?? true,
    copyFromSlug: "",
  };
}

function toAdminFormState(admin?: ManagedAdminAccount | null): AdminFormState {
  return {
    email: admin?.email ?? "",
    password: "",
    name: admin?.name ?? "",
    role: admin?.role ?? "ADMIN",
    divisionSlug: admin?.divisionSlug ?? "",
    isActive: admin?.isActive ?? true,
  };
}

function getRoleLabel(role: ManagedAdminAccount["role"]) {
  if (role === "SUPER_ADMIN") {
    return "최고관리자";
  }

  if (role === "ASSISTANT") {
    return "조교";
  }

  return "관리자";
}

export function SuperAdminManager({
  initialDivisions,
  initialAdmins,
}: SuperAdminManagerProps) {
  const [divisions, setDivisions] = useState(initialDivisions);
  const [admins, setAdmins] = useState(initialAdmins);
  const [editingDivisionSlug, setEditingDivisionSlug] = useState<string | null>(null);
  const [divisionForm, setDivisionForm] = useState<DivisionFormState>(toDivisionFormState());
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [adminForm, setAdminForm] = useState<AdminFormState>(toAdminFormState());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingDivision, setIsSavingDivision] = useState(false);
  const [isDeletingDivisionSlug, setIsDeletingDivisionSlug] = useState<string | null>(null);
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);
  const [isDeletingAdminId, setIsDeletingAdminId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  async function refreshAll(showToast = false) {
    setIsRefreshing(true);

    try {
      const [divisionResponse, adminResponse] = await Promise.all([
        fetch("/api/divisions", { cache: "no-store" }),
        fetch("/api/admin-users", { cache: "no-store" }),
      ]);

      const [divisionData, adminData] = await Promise.all([
        divisionResponse.json(),
        adminResponse.json(),
      ]);

      if (!divisionResponse.ok) {
        throw new Error(divisionData.error ?? "지점 목록을 불러오지 못했습니다.");
      }

      if (!adminResponse.ok) {
        throw new Error(adminData.error ?? "계정 목록을 불러오지 못했습니다.");
      }

      setDivisions(divisionData.divisions);
      setAdmins(adminData.admins);

      if (showToast) {
        toast.success("최고관리자 데이터를 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  function resetDivisionForm() {
    setEditingDivisionSlug(null);
    setDivisionForm(toDivisionFormState());
  }

  function resetAdminForm() {
    setEditingAdminId(null);
    setAdminForm(toAdminFormState());
    setResetPasswordValue("");
  }

  async function handleDivisionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingDivision(true);

    try {
      const response = await fetch(
        editingDivisionSlug ? `/api/divisions/${editingDivisionSlug}` : "/api/divisions",
        {
          method: editingDivisionSlug ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: divisionForm.name,
            slug: divisionForm.slug,
            fullName: divisionForm.fullName,
            color: divisionForm.color,
            displayOrder: Number(divisionForm.displayOrder || 0),
            isActive: divisionForm.isActive,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "지점 저장에 실패했습니다.");
      }

      // 신규 생성 + 설정 복사 선택 시 설정 복사 API 호출
      if (!editingDivisionSlug && divisionForm.copyFromSlug) {
        const copyRes = await fetch("/api/super-admin/copy-division-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceSlug: divisionForm.copyFromSlug,
            targetSlug: divisionForm.slug,
          }),
        });
        const copyData = await copyRes.json();
        if (!copyRes.ok) {
          toast.warning(`지점은 추가됐지만 설정 복사에 실패했습니다: ${copyData.error ?? ""}`);
        } else {
          toast.success(
            `지점을 추가하고 설정을 복사했습니다. (교시 ${copyData.periodsCount}개, 규칙 ${copyData.rulesCount}개)`,
          );
        }
      } else {
        toast.success(editingDivisionSlug ? "지점 정보를 수정했습니다." : "지점을 추가했습니다.");
      }

      resetDivisionForm();
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "지점 저장에 실패했습니다.");
    } finally {
      setIsSavingDivision(false);
    }
  }

  async function handleDivisionDelete(division: ManagedDivision) {
    const confirmed = window.confirm(
      [
        `'${division.name}' 지점을 삭제하시겠습니까?`,
        "",
        "삭제하면 해당 지점의 학생, 출결, 시험, 수납, 설정 등 지점 데이터가 함께 제거됩니다.",
        "해당 지점의 관리자와 조교 계정은 비활성화되고 지점 연결이 해제됩니다.",
        "",
        "이 작업은 되돌릴 수 없습니다.",
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    setIsDeletingDivisionSlug(division.slug);

    try {
      const response = await fetch(`/api/divisions/${division.slug}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "지점 삭제에 실패했습니다.");
      }

      if (editingDivisionSlug === division.slug) {
        resetDivisionForm();
      }

      if (adminForm.divisionSlug === division.slug) {
        setAdminForm((current) => ({ ...current, divisionSlug: "" }));
      }

      toast.success(`${division.name} 지점을 삭제했습니다.`);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "지점 삭제에 실패했습니다.");
    } finally {
      setIsDeletingDivisionSlug(null);
    }
  }

  async function handleAdminDelete(admin: ManagedAdminAccount) {
    const confirmed = window.confirm(
      [`'${admin.name}' 계정을 비활성화하시겠습니까?`, "", "비활성화 후에도 데이터는 유지되며, 해당 계정으로 로그인이 불가능해집니다."].join("\n"),
    );
    if (!confirmed) return;

    setIsDeletingAdminId(admin.id);
    try {
      const response = await fetch(`/api/admin-users/${admin.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "계정 비활성화에 실패했습니다.");
      toast.success(`${admin.name} 계정을 비활성화했습니다.`);
      if (editingAdminId === admin.id) resetAdminForm();
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "계정 비활성화에 실패했습니다.");
    } finally {
      setIsDeletingAdminId(null);
    }
  }

  async function handlePasswordReset(adminId: string) {
    if (!resetPasswordValue || resetPasswordValue.length < 8) {
      toast.error("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setIsResettingPassword(true);
    try {
      const response = await fetch(`/api/admin-users/${adminId}/password`, {
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

  async function handleAdminSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingAdmin(true);

    try {
      const response = await fetch(
        editingAdminId ? `/api/admin-users/${editingAdminId}` : "/api/admin-users",
        {
          method: editingAdminId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: adminForm.email,
            password: adminForm.password,
            name: adminForm.name,
            role: adminForm.role,
            divisionSlug: adminForm.role === "SUPER_ADMIN" ? null : adminForm.divisionSlug || null,
            isActive: adminForm.isActive,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "계정 저장에 실패했습니다.");
      }

      toast.success(editingAdminId ? "계정을 수정했습니다." : "계정을 추가했습니다.");
      resetAdminForm();
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "계정 저장에 실패했습니다.");
    } finally {
      setIsSavingAdmin(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              최고관리
            </p>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-950">
              지점 및 운영 계정 관리
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              최고관리자가 지점을 추가하거나 수정하고, 각 지점 관리자와 조교 계정을 배정하는
              화면입니다. 지점 관리자는 본인 지점만 관리할 수 있고, 다른 지점 데이터에는 접근할
              수 없습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refreshAll(true)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {isRefreshing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            새로고침
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                지점
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-950">
                {editingDivisionSlug ? "지점 수정" : "지점 추가"}
              </h3>
            </div>

            <button
              type="button"
              onClick={resetDivisionForm}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              초기화
            </button>
          </div>

          <form onSubmit={handleDivisionSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">지점 이름</span>
                <input
                  value={divisionForm.name}
                  onChange={(event) =>
                    setDivisionForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">slug</span>
                <input
                  value={divisionForm.slug}
                  onChange={(event) =>
                    setDivisionForm((current) => ({
                      ...current,
                      slug: event.target.value.toLowerCase(),
                    }))
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
                  disabled={Boolean(editingDivisionSlug)}
                  required
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">전체 이름</span>
              <input
                value={divisionForm.fullName}
                onChange={(event) =>
                  setDivisionForm((current) => ({ ...current, fullName: event.target.value }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                required
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">브랜드 색상</span>
                <input
                  value={divisionForm.color}
                  onChange={(event) =>
                    setDivisionForm((current) => ({ ...current, color: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">표시 순서</span>
                <input
                  type="number"
                  min="0"
                  value={divisionForm.displayOrder}
                  onChange={(event) =>
                    setDivisionForm((current) => ({
                      ...current,
                      displayOrder: event.target.value,
                    }))
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={divisionForm.isActive}
                onChange={(event) =>
                  setDivisionForm((current) => ({ ...current, isActive: event.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              활성 지점으로 운영
            </label>

            {!editingDivisionSlug && divisions.length > 0 && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  설정 복사 (선택)
                </span>
                <select
                  value={divisionForm.copyFromSlug}
                  onChange={(event) =>
                    setDivisionForm((current) => ({
                      ...current,
                      copyFromSlug: event.target.value,
                    }))
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="">복사 안 함</option>
                  {divisions.map((division) => (
                    <option key={division.id} value={division.slug}>
                      {division.name} (/{division.slug}) — 교시·상벌점·운영설정 복사
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-400">
                  선택 시 해당 지점의 교시, 상벌점 규칙, 운영 설정이 새 지점으로 복사됩니다.
                </p>
              </label>
            )}

            <button
              type="submit"
              disabled={isSavingDivision}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {isSavingDivision ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {editingDivisionSlug ? "지점 저장" : "지점 추가"}
            </button>
          </form>

          <div className="mt-8 space-y-3">
            {divisions.map((division) => (
              <div key={division.id} className="rounded-[10px] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: division.color }} />
                      <p className="text-xl font-bold text-slate-950">{division.name}</p>
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                        /{division.slug}
                      </span>
                      {!division.isActive ? (
                        <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold text-red-700">
                          비활성
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{division.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">표시 순서 {division.displayOrder}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDivisionSlug(division.slug);
                        setDivisionForm(toDivisionFormState(division));
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
                    >
                      <Pencil className="h-4 w-4" />
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDivisionDelete(division)}
                      disabled={isDeletingDivisionSlug === division.slug}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-white disabled:opacity-60"
                    >
                      {isDeletingDivisionSlug === division.slug ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                계정
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-950">
                {editingAdminId ? "운영 계정 수정" : "운영 계정 추가"}
              </h3>
            </div>

            <button
              type="button"
              onClick={resetAdminForm}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              초기화
            </button>
          </div>

          <form onSubmit={handleAdminSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">이름</span>
                <input
                  value={adminForm.name}
                  onChange={(event) =>
                    setAdminForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">권한</span>
                <select
                  value={adminForm.role}
                  onChange={(event) =>
                    setAdminForm((current) => ({
                      ...current,
                      role: event.target.value as AdminFormState["role"],
                      divisionSlug: event.target.value === "SUPER_ADMIN" ? "" : current.divisionSlug,
                    }))
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="SUPER_ADMIN">최고관리자</option>
                  <option value="ADMIN">관리자</option>
                  <option value="ASSISTANT">조교</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">이메일</span>
                <input
                  value={adminForm.email}
                  onChange={(event) =>
                    setAdminForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
                  disabled={Boolean(editingAdminId)}
                  required
                />
              </label>

              {!editingAdminId ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">초기 비밀번호</span>
                  <input
                    type="password"
                    value={adminForm.password}
                    onChange={(event) =>
                      setAdminForm((current) => ({ ...current, password: event.target.value }))
                    }
                    className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                    required
                  />
                </label>
              ) : null}
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">소속 지점</span>
              <select
                value={adminForm.divisionSlug}
                onChange={(event) =>
                  setAdminForm((current) => ({ ...current, divisionSlug: event.target.value }))
                }
                disabled={adminForm.role === "SUPER_ADMIN"}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">선택하세요</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.slug}>
                    {division.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={adminForm.isActive}
                onChange={(event) =>
                  setAdminForm((current) => ({ ...current, isActive: event.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              로그인 가능한 활성 계정으로 유지
            </label>

            <button
              type="submit"
              disabled={isSavingAdmin}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {isSavingAdmin ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {editingAdminId ? "계정 저장" : "계정 추가"}
            </button>
          </form>

          {editingAdminId ? (
            <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">비밀번호 재설정</p>
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  placeholder="새 비밀번호 (8자 이상)"
                  value={resetPasswordValue}
                  onChange={(event) => setResetPasswordValue(event.target.value)}
                  className="flex-1 rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                />
                <button
                  type="button"
                  disabled={isResettingPassword}
                  onClick={() => handlePasswordReset(editingAdminId)}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  {isResettingPassword ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  변경
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-8 space-y-3">
            {admins.map((admin) => (
              <div key={admin.id} className="rounded-[10px] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-bold text-slate-950">{admin.name}</p>
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                        {getRoleLabel(admin.role)}
                      </span>
                      {!admin.isActive ? (
                        <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold text-red-700">
                          비활성
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{admin.email ?? "이메일 없음"}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {admin.divisionName ?? "전체 권한"}{" "}
                      {admin.divisionSlug ? `(/${admin.divisionSlug})` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAdminId(admin.id);
                        setAdminForm(toAdminFormState(admin));
                        setResetPasswordValue("");
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
                    >
                      <Pencil className="h-4 w-4" />
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdminDelete(admin)}
                      disabled={isDeletingAdminId === admin.id}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-white disabled:opacity-60"
                    >
                      {isDeletingAdminId === admin.id ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      비활성화
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
