"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "최고 관리자",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
  VIEWER: "조회 전용",
};

const ROLE_COLOR: Record<AdminRole, string> = {
  SUPER_ADMIN: "bg-purple-50 text-purple-700 border-purple-200",
  DIRECTOR: "bg-forest/10 text-forest border-forest/20",
  DEPUTY_DIRECTOR: "bg-forest/5 text-forest/80 border-forest/10",
  MANAGER: "bg-sky-50 text-sky-700 border-sky-200",
  ACADEMIC_ADMIN: "bg-sky-50 text-sky-600 border-sky-100",
  COUNSELOR: "bg-ink/5 text-slate border-ink/10",
  TEACHER: "bg-ink/5 text-slate border-ink/10",
  VIEWER: "bg-ink/5 text-slate border-ink/10",
};

// Roles that can be assigned (ordered high to low)
const ASSIGNABLE_ROLES: AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.DIRECTOR,
  AdminRole.DEPUTY_DIRECTOR,
  AdminRole.MANAGER,
  AdminRole.ACADEMIC_ADMIN,
  AdminRole.COUNSELOR,
  AdminRole.TEACHER,
  AdminRole.VIEWER,
];

const ROLE_LEVEL: Record<AdminRole, number> = {
  VIEWER: 0,
  TEACHER: 1,
  COUNSELOR: 2,
  ACADEMIC_ADMIN: 3,
  MANAGER: 4,
  DEPUTY_DIRECTOR: 5,
  DIRECTOR: 6,
  SUPER_ADMIN: 7,
};

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
};

interface InviteForm {
  email: string;
  name: string;
  phone: string;
  role: AdminRole;
}

const EMPTY_INVITE: InviteForm = {
  email: "",
  name: "",
  phone: "",
  role: AdminRole.VIEWER,
};

interface EditForm {
  name: string;
  phone: string;
  role: AdminRole;
  isActive: boolean;
}

interface Props {
  initialAdmins: AdminUserRow[];
  currentUserId: string;
  currentUserRole: AdminRole;
  isDirectorPlus: boolean;
}

export function AccountsManager({
  initialAdmins,
  currentUserId,
  currentUserRole,
  isDirectorPlus,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showInactive, setShowInactive] = useState(false);

  // --- Invite ---
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(EMPTY_INVITE);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // --- Edit ---
  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    phone: "",
    role: AdminRole.VIEWER,
    isActive: true,
  });
  const [editError, setEditError] = useState<string | null>(null);

  // --- Deactivate ---
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUserRow | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const displayed = showInactive
    ? initialAdmins
    : initialAdmins.filter((a) => a.isActive);

  // ── Invite helpers ──────────────────────────────────────────────
  function openInvite() {
    setInviteForm(EMPTY_INVITE);
    setInviteError(null);
    setInviteSuccess(null);
    setShowInviteModal(true);
  }

  function handleInvite() {
    if (!inviteForm.email.trim() || !inviteForm.name.trim()) {
      setInviteError("이메일과 이름을 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: inviteForm.email.trim(),
            name: inviteForm.name.trim(),
            role: inviteForm.role,
            phone: inviteForm.phone.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "초대 실패");
        setInviteSuccess(
          `${inviteForm.name}님(${inviteForm.email})에게 초대 메일을 발송했습니다.`,
        );
        setInviteError(null);
        router.refresh();
      } catch (e) {
        setInviteError(e instanceof Error ? e.message : "초대 실패");
      }
    });
  }

  // ── Edit helpers ─────────────────────────────────────────────────
  function openEdit(admin: AdminUserRow) {
    setEditTarget(admin);
    setEditForm({
      name: admin.name,
      phone: admin.phone ?? "",
      role: admin.role,
      isActive: admin.isActive,
    });
    setEditError(null);
  }

  function handleEdit() {
    if (!editTarget) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/users/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editForm.name.trim(),
            phone: editForm.phone.trim() || null,
            role: editForm.role,
            isActive: editForm.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        setEditTarget(null);
        router.refresh();
      } catch (e) {
        setEditError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  // ── Deactivate helpers ───────────────────────────────────────────
  function openDeactivate(admin: AdminUserRow) {
    setDeactivateTarget(admin);
    setDeactivateError(null);
  }

  function handleDeactivate() {
    if (!deactivateTarget) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/users/${deactivateTarget.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "비활성화 실패");
        setDeactivateTarget(null);
        router.refresh();
      } catch (e) {
        setDeactivateError(e instanceof Error ? e.message : "비활성화 실패");
      }
    });
  }

  // Roles that the current user can assign (strictly lower than own role)
  const assignableRoles = ASSIGNABLE_ROLES.filter(
    (r) => ROLE_LEVEL[r] < ROLE_LEVEL[currentUserRole],
  );

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-ink/20"
          />
          비활성 계정 포함
        </label>
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate">총 {displayed.length}명</p>
          {isDirectorPlus && (
            <button
              onClick={openInvite}
              className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              관리자 초대
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10 bg-mist">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">이메일</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">연락처</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">권한</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">상태</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">생성일</th>
                {isDirectorPlus && (
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate">관리</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {displayed.length === 0 ? (
                <tr>
                  <td
                    colSpan={isDirectorPlus ? 7 : 6}
                    className="px-4 py-12 text-center text-sm text-slate"
                  >
                    등록된 관리자 계정이 없습니다.
                  </td>
                </tr>
              ) : (
                displayed.map((admin) => {
                  const isSelf = admin.id === currentUserId;
                  const canManage =
                    isDirectorPlus &&
                    ROLE_LEVEL[admin.role] < ROLE_LEVEL[currentUserRole];

                  return (
                    <tr
                      key={admin.id}
                      className={`hover:bg-mist/40 ${!admin.isActive ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        {admin.name}
                        {isSelf && (
                          <span className="ml-1.5 rounded-full border border-ember/20 bg-ember/10 px-2 py-0.5 text-[10px] font-semibold text-ember">
                            나
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">{admin.email}</td>
                      <td className="px-4 py-3 text-slate">{admin.phone ?? "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[admin.role]}`}
                        >
                          {ROLE_LABEL[admin.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                            admin.isActive
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-ink/10 bg-ink/5 text-slate"
                          }`}
                        >
                          {admin.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate">
                        {new Date(admin.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      {isDirectorPlus && (
                        <td className="px-4 py-3 text-right">
                          {canManage ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEdit(admin)}
                                className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-forest hover:text-forest"
                              >
                                편집
                              </button>
                              {admin.isActive && (
                                <button
                                  onClick={() => openDeactivate(admin)}
                                  className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                                >
                                  비활성화
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-ink/30">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Invite Modal ─────────────────────────────────────────── */}
      <ActionModal
        open={showInviteModal}
        badgeLabel="관리자 계정"
        title="관리자 초대"
        description="이메일로 관리자를 초대합니다. 초대 메일이 발송되며, 수락 후 계정이 활성화됩니다."
        confirmLabel={inviteSuccess ? "닫기" : "초대 발송"}
        cancelLabel={inviteSuccess ? undefined : "취소"}
        isPending={isPending}
        onClose={() => setShowInviteModal(false)}
        onConfirm={inviteSuccess ? () => setShowInviteModal(false) : handleInvite}
        panelClassName="max-w-md"
      >
        <div className="space-y-3 pt-2">
          {inviteError && (
            <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">
              {inviteError}
            </p>
          )}
          {inviteSuccess && (
            <p className="rounded-[12px] bg-forest/10 px-4 py-2 text-sm text-forest">
              {inviteSuccess}
            </p>
          )}
          {!inviteSuccess && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate">
                  이메일 *
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="admin@example.com"
                  className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate">
                  이름 *
                </label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="홍길동"
                  className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate">
                  연락처
                </label>
                <input
                  type="tel"
                  value={inviteForm.phone}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  placeholder="010-0000-0000"
                  className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate">
                  권한 *
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, role: e.target.value as AdminRole }))
                  }
                  className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </ActionModal>

      {/* ── Edit Modal ───────────────────────────────────────────── */}
      <ActionModal
        open={editTarget !== null}
        badgeLabel="관리자 계정"
        title="계정 편집"
        description={`${editTarget?.name ?? ""}(${editTarget?.email ?? ""}) 계정 정보를 수정합니다.`}
        confirmLabel="저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEdit}
        panelClassName="max-w-md"
      >
        <div className="space-y-3 pt-2">
          {editError && (
            <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">
              {editError}
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">이름 *</label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">연락처</label>
            <input
              type="tel"
              value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="010-0000-0000"
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">권한 *</label>
            <select
              value={editForm.role}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, role: e.target.value as AdminRole }))
              }
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, isActive: e.target.checked }))
                }
                className="rounded border-ink/20"
              />
              활성 계정
            </label>
          </div>
        </div>
      </ActionModal>

      {/* ── Deactivate Confirm Modal ─────────────────────────────── */}
      <ActionModal
        open={deactivateTarget !== null}
        badgeLabel="관리자 계정"
        badgeTone="warning"
        title="계정 비활성화"
        description={`${deactivateTarget?.name ?? ""}(${deactivateTarget?.email ?? ""}) 계정을 비활성화하고 Supabase Auth에서 삭제합니다. 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="비활성화"
        confirmTone="danger"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
      >
        {deactivateError && (
          <p className="mt-2 rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">
            {deactivateError}
          </p>
        )}
      </ActionModal>
    </div>
  );
}
