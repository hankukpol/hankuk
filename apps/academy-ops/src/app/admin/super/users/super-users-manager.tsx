"use client";

import { AdminRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { ROLE_LABEL } from "@/lib/constants";
import {
  SUPER_ADMIN_ROLE_OPTIONS,
  type AcademyOption,
  type SuperAdminUserRow,
} from "@/lib/super-admin";

type InviteForm = {
  email: string;
  name: string;
  phone: string;
  role: AdminRole;
  academyId: string;
};

type EditForm = {
  name: string;
  phone: string;
  role: AdminRole;
  academyId: string;
  isActive: boolean;
};

function createEmptyInviteForm(academyOptions: AcademyOption[]): InviteForm {
  return {
    email: "",
    name: "",
    phone: "",
    role: AdminRole.DIRECTOR,
    academyId: academyOptions[0] ? String(academyOptions[0].id) : "",
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}

export function SuperUsersManager({
  initialUsers,
  academyOptions,
}: {
  initialUsers: SuperAdminUserRow[];
  academyOptions: AcademyOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedAcademy, setSelectedAcademy] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(() => createEmptyInviteForm(academyOptions));
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<SuperAdminUserRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    phone: "",
    role: AdminRole.DIRECTOR,
    academyId: academyOptions[0] ? String(academyOptions[0].id) : "",
    isActive: true,
  });
  const [editError, setEditError] = useState<string | null>(null);

  const displayedUsers = useMemo(() => {
    return initialUsers.filter((user) => {
      if (!showInactive && !user.isActive) {
        return false;
      }

      if (selectedAcademy !== "all") {
        if ((user.academyId === null ? "super" : String(user.academyId)) !== selectedAcademy) {
          return false;
        }
      }

      if (selectedRole !== "all" && user.role !== selectedRole) {
        return false;
      }

      return true;
    });
  }, [initialUsers, selectedAcademy, selectedRole, showInactive]);

  function openInvite() {
    setInviteForm(createEmptyInviteForm(academyOptions));
    setInviteError(null);
    setInviteOpen(true);
  }

  function openEdit(user: SuperAdminUserRow) {
    setEditTarget(user);
    setEditForm({
      name: user.name,
      phone: user.phone ?? "",
      role: user.role,
      academyId: user.academyId === null ? "" : String(user.academyId),
      isActive: user.isActive,
    });
    setEditError(null);
  }

  function submitInvite() {
    startTransition(async () => {
      setInviteError(null);

      const response = await fetch("/api/super/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteForm.email,
          name: inviteForm.name,
          phone: inviteForm.phone,
          role: inviteForm.role,
          academyId: inviteForm.role === AdminRole.SUPER_ADMIN ? null : inviteForm.academyId,
        }),
      });
      const payload = await response.json().catch(() => ({ error: "관리자 초대에 실패했습니다." }));

      if (!response.ok) {
        setInviteError(typeof payload?.error === "string" ? payload.error : "관리자 초대에 실패했습니다.");
        return;
      }

      setInviteOpen(false);
      router.refresh();
    });
  }

  function submitEdit() {
    if (!editTarget) {
      return;
    }

    startTransition(async () => {
      setEditError(null);

      const response = await fetch(`/api/super/users/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          role: editForm.role,
          academyId: editForm.role === AdminRole.SUPER_ADMIN ? null : editForm.academyId,
          isActive: editForm.isActive,
        }),
      });
      const payload = await response.json().catch(() => ({ error: "관리자 수정에 실패했습니다." }));

      if (!response.ok) {
        setEditError(typeof payload?.error === "string" ? payload.error : "관리자 수정에 실패했습니다.");
        return;
      }

      setEditTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">전 지점 관리자 계정</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              지점 소속, 역할, 활성 상태를 슈퍼관리자 권한으로 일괄 관리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={openInvite}
            className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            관리자 초대
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={selectedAcademy}
            onChange={(event) => setSelectedAcademy(event.target.value)}
            className="rounded-full border border-ink/15 px-4 py-2 text-sm outline-none focus:border-ember"
          >
            <option value="all">전체 지점</option>
            <option value="super">슈퍼 관리자</option>
            {academyOptions.map((academy) => (
              <option key={academy.id} value={academy.id}>
                {academy.name}
              </option>
            ))}
          </select>

          <select
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
            className="rounded-full border border-ink/15 px-4 py-2 text-sm outline-none focus:border-ember"
          >
            <option value="all">전체 권한</option>
            {SUPER_ADMIN_ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="rounded border-ink/15"
            />
            비활성 계정 포함
          </label>

          <p className="ml-auto text-sm text-slate">현재 {displayedUsers.length.toLocaleString("ko-KR")}명</p>
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-mist text-slate">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">이메일</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">권한</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">소속 지점</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em]">상태</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em]">생성일</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {displayedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate">
                      조건에 맞는 관리자 계정이 없습니다.
                    </td>
                  </tr>
                ) : (
                  displayedUsers.map((user) => (
                    <tr key={user.id} className={!user.isActive ? "opacity-60" : ""}>
                      <td className="px-4 py-4 font-semibold text-ink">{user.name}</td>
                      <td className="px-4 py-4 text-slate">{user.email}</td>
                      <td className="px-4 py-4 text-slate">{user.phone ?? "-"}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-1 text-xs font-semibold text-ink">
                          {user.roleLabel}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {user.academyName ? (
                          <div>
                            <p className="font-medium text-ink">{user.academyName}</p>
                            <p className="mt-1 text-xs text-slate">{user.academyCode}</p>
                          </div>
                        ) : (
                          <span className="text-slate">전체 지점</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            user.isActive
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-ink/10 bg-ink/5 text-slate"
                          }`}
                        >
                          {user.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center text-slate">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-forest hover:text-forest"
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ActionModal
        open={inviteOpen}
        badgeLabel="관리자 계정"
        title="관리자 초대"
        description="슈퍼관리자는 전체 지점을, 일반 관리자는 소속 지점 하나를 지정해 초대합니다."
        confirmLabel="초대 보내기"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setInviteOpen(false)}
        onConfirm={submitInvite}
        panelClassName="max-w-xl"
      >
        <UserFormFields
          mode="invite"
          inviteForm={inviteForm}
          setInviteForm={setInviteForm}
          academyOptions={academyOptions}
          error={inviteError}
        />
      </ActionModal>

      <ActionModal
        open={editTarget !== null}
        badgeLabel="관리자 계정"
        title="관리자 정보 수정"
        description="권한, 소속 지점, 활성 상태를 함께 조정합니다."
        confirmLabel="변경 저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={submitEdit}
        panelClassName="max-w-xl"
      >
        <UserFormFields
          mode="edit"
          editForm={editForm}
          setEditForm={setEditForm}
          academyOptions={academyOptions}
          error={editError}
          targetEmail={editTarget?.email ?? ""}
        />
      </ActionModal>
    </div>
  );
}

function UserFormFields({
  mode,
  academyOptions,
  error,
  inviteForm,
  setInviteForm,
  editForm,
  setEditForm,
  targetEmail,
}: {
  mode: "invite" | "edit";
  academyOptions: AcademyOption[];
  error: string | null;
  inviteForm?: InviteForm;
  setInviteForm?: Dispatch<SetStateAction<InviteForm>>;
  editForm?: EditForm;
  setEditForm?: Dispatch<SetStateAction<EditForm>>;
  targetEmail?: string;
}) {
  const currentRole = mode === "invite" ? inviteForm?.role ?? AdminRole.DIRECTOR : editForm?.role ?? AdminRole.DIRECTOR;
  const roleUsesAcademy = currentRole !== AdminRole.SUPER_ADMIN;

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
      {mode === "invite" ? (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">이메일</label>
          <input
            type="email"
            value={inviteForm?.email ?? ""}
            onChange={(event) => setInviteForm?.((current) => ({ ...current, email: event.target.value }))}
            className="w-full rounded-[16px] border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ember"
          />
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">이메일</label>
          <div className="rounded-[16px] border border-ink/10 bg-mist px-4 py-3 text-sm text-slate">{targetEmail}</div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">이름</label>
          <input
            type="text"
            value={mode === "invite" ? inviteForm?.name ?? "" : editForm?.name ?? ""}
            onChange={(event) => {
              if (mode === "invite") {
                setInviteForm?.((current) => ({ ...current, name: event.target.value }));
              } else {
                setEditForm?.((current) => ({ ...current, name: event.target.value }));
              }
            }}
            className="w-full rounded-[16px] border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ember"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">연락처</label>
          <input
            type="tel"
            value={mode === "invite" ? inviteForm?.phone ?? "" : editForm?.phone ?? ""}
            onChange={(event) => {
              if (mode === "invite") {
                setInviteForm?.((current) => ({ ...current, phone: event.target.value }));
              } else {
                setEditForm?.((current) => ({ ...current, phone: event.target.value }));
              }
            }}
            className="w-full rounded-[16px] border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ember"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">권한</label>
          <select
            value={currentRole}
            onChange={(event) => {
              const nextRole = event.target.value as AdminRole;
              if (mode === "invite") {
                setInviteForm?.((current) => ({
                  ...current,
                  role: nextRole,
                  academyId: nextRole === AdminRole.SUPER_ADMIN ? "" : current.academyId || (academyOptions[0] ? String(academyOptions[0].id) : ""),
                }));
              } else {
                setEditForm?.((current) => ({
                  ...current,
                  role: nextRole,
                  academyId: nextRole === AdminRole.SUPER_ADMIN ? "" : current.academyId || (academyOptions[0] ? String(academyOptions[0].id) : ""),
                }));
              }
            }}
            className="w-full rounded-[16px] border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ember"
          >
            {SUPER_ADMIN_ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">소속 지점</label>
          <select
            value={mode === "invite" ? inviteForm?.academyId ?? "" : editForm?.academyId ?? ""}
            disabled={!roleUsesAcademy}
            onChange={(event) => {
              if (mode === "invite") {
                setInviteForm?.((current) => ({ ...current, academyId: event.target.value }));
              } else {
                setEditForm?.((current) => ({ ...current, academyId: event.target.value }));
              }
            }}
            className="w-full rounded-[16px] border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ember disabled:bg-mist disabled:text-slate"
          >
            {!roleUsesAcademy ? <option value="">전체 지점</option> : null}
            {academyOptions.map((academy) => (
              <option key={academy.id} value={academy.id}>
                {academy.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === "edit" ? (
        <label className="flex items-center gap-2 text-sm text-slate">
          <input
            type="checkbox"
            checked={editForm?.isActive ?? true}
            onChange={(event) => setEditForm?.((current) => ({ ...current, isActive: event.target.checked }))}
            className="rounded border-ink/15"
          />
          계정 활성 상태 유지
        </label>
      ) : null}
    </div>
  );
}
