"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import type { StaffRow, StaffKpi } from "./page";

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "최고 관리자",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무주임",
  COUNSELOR: "상담원",
  TEACHER: "강사",
  VIEWER: "조회자",
};

const ROLE_COLOR: Record<AdminRole, string> = {
  SUPER_ADMIN: "bg-red-50 text-red-700 border-red-200",
  DIRECTOR: "bg-amber-50 text-amber-700 border-amber-200",
  DEPUTY_DIRECTOR: "bg-amber-50 text-amber-600 border-amber-200",
  MANAGER: "bg-amber-50 text-amber-700 border-amber-200",
  ACADEMIC_ADMIN: "bg-forest/10 text-forest border-forest/20",
  COUNSELOR: "bg-sky-50 text-sky-700 border-sky-200",
  TEACHER: "bg-violet-50 text-violet-700 border-violet-200",
  VIEWER: "bg-ink/5 text-slate border-ink/10",
};

const ROLES: AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.DIRECTOR,
  AdminRole.DEPUTY_DIRECTOR,
  AdminRole.MANAGER,
  AdminRole.ACADEMIC_ADMIN,
  AdminRole.COUNSELOR,
  AdminRole.TEACHER,
  AdminRole.VIEWER,
];

interface InviteForm {
  email: string;
  displayName: string;
  role: AdminRole;
}

const EMPTY_INVITE: InviteForm = {
  email: "",
  displayName: "",
  role: AdminRole.VIEWER,
};

interface Props {
  initialStaff: StaffRow[];
  kpi: StaffKpi;
  isSuperAdmin: boolean;
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return "-";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ko });
  } catch {
    return "-";
  }
}

export function StaffManager({ initialStaff, isSuperAdmin }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [staff, setStaff] = useState<StaffRow[]>(initialStaff);
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(EMPTY_INVITE);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Inline role-change state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<AdminRole>(AdminRole.VIEWER);
  const [roleError, setRoleError] = useState<string | null>(null);

  // Toggle-active confirm state
  const [toggleTarget, setToggleTarget] = useState<StaffRow | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  function showToast(type: "ok" | "err", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  const displayed = showInactive ? staff : staff.filter((s) => s.isActive);

  // ── Invite ──────────────────────────────────────────────────────────────────

  function openInvite() {
    setInviteForm(EMPTY_INVITE);
    setInviteError(null);
    setInviteSuccess(null);
    setShowInviteModal(true);
  }

  function handleInvite() {
    if (!inviteForm.email.trim() || !inviteForm.displayName.trim()) {
      setInviteError("이메일과 이름을 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/staff/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: inviteForm.email.trim(),
            displayName: inviteForm.displayName.trim(),
            role: inviteForm.role,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "초대 실패");
        setInviteSuccess(`${inviteForm.displayName}님(${inviteForm.email})에게 초대 메일을 발송했습니다.`);
        setInviteError(null);
        router.refresh();
      } catch (e) {
        setInviteError(e instanceof Error ? e.message : "초대 실패");
      }
    });
  }

  // ── Inline role editing ──────────────────────────────────────────────────────

  function startRoleEdit(row: StaffRow) {
    setEditingRoleId(row.id);
    setEditingRole(row.role);
    setRoleError(null);
  }

  function cancelRoleEdit() {
    setEditingRoleId(null);
    setRoleError(null);
  }

  function saveRoleEdit(row: StaffRow) {
    if (editingRole === row.role) {
      setEditingRoleId(null);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/settings/staff/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: editingRole }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "권한 변경 실패");
        setStaff((prev) =>
          prev.map((s) => (s.id === row.id ? { ...s, role: editingRole } : s)),
        );
        setEditingRoleId(null);
        showToast("ok", `${row.name}의 권한이 ${ROLE_LABEL[editingRole]}(으)로 변경되었습니다.`);
      } catch (e) {
        setRoleError(e instanceof Error ? e.message : "권한 변경 실패");
      }
    });
  }

  // ── Toggle active ────────────────────────────────────────────────────────────

  function openToggleActive(row: StaffRow) {
    setToggleTarget(row);
    setToggleError(null);
  }

  function handleToggleActive() {
    if (!toggleTarget) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/settings/staff/${toggleTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !toggleTarget.isActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "처리 실패");
        const newActive = !toggleTarget.isActive;
        setStaff((prev) =>
          prev.map((s) =>
            s.id === toggleTarget.id ? { ...s, isActive: newActive } : s,
          ),
        );
        showToast("ok", `${toggleTarget.name} 계정이 ${newActive ? "활성화" : "비활성화"}되었습니다.`);
        setToggleTarget(null);
      } catch (e) {
        setToggleError(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={[
            "mb-4 rounded-2xl border px-4 py-3 text-sm",
            toast.type === "ok"
              ? "border-forest/20 bg-forest/10 text-forest"
              : "border-red-200 bg-red-50 text-red-700",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-slate cursor-pointer select-none">
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
          {isSuperAdmin && (
            <button
              onClick={openInvite}
              className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              직원 초대
            </button>
          )}
        </div>
      </div>

      {/* Role-edit inline error */}
      {roleError && (
        <div className="mb-3 rounded-[12px] bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">
          {roleError}
        </div>
      )}

      {/* Table */}
      <div className="rounded-[20px] border border-ink/10 overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-mist border-b border-ink/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">이메일</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">연락처</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">권한</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">직무</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">배분율</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">상태</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">마지막 로그인</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate text-sm">
                    직원이 없습니다.
                  </td>
                </tr>
              ) : (
                displayed.map((s) => {
                  const isEditingRole = editingRoleId === s.id;
                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-mist/40 ${!s.isActive ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-slate text-xs">{s.email}</td>
                      <td className="px-4 py-3 text-slate">{s.phone ?? "-"}</td>

                      {/* 권한 — inline edit (SUPER_ADMIN only, not self) */}
                      <td className="px-4 py-3 text-center">
                        {isSuperAdmin && isEditingRole ? (
                          <div className="inline-flex items-center gap-1">
                            <select
                              value={editingRole}
                              onChange={(e) => setEditingRole(e.target.value as AdminRole)}
                              className="rounded-lg border border-ink/20 px-2 py-1 text-xs outline-none focus:border-forest"
                              autoFocus
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => saveRoleEdit(s)}
                              disabled={isPending}
                              className="rounded-md bg-forest px-2 py-1 text-xs text-white hover:bg-forest/80 disabled:opacity-50"
                            >
                              저장
                            </button>
                            <button
                              onClick={cancelRoleEdit}
                              className="rounded-md border border-ink/20 px-2 py-1 text-xs text-slate hover:text-ink"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium cursor-default ${ROLE_COLOR[s.role] ?? ""} ${isSuperAdmin ? "cursor-pointer hover:opacity-70 transition-opacity" : ""}`}
                            onClick={
                              isSuperAdmin
                                ? () => startRoleEdit(s)
                                : undefined
                            }
                            title={isSuperAdmin ? "클릭하여 권한 변경" : undefined}
                          >
                            {ROLE_LABEL[s.role]}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-slate">
                          {s.staffRole ?? "-"}
                        </span>
                      </td>

                      {/* 배분율 */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-slate tabular-nums">
                          {s.shareRatio !== null ? `${s.shareRatio}%` : "-"}
                        </span>
                      </td>

                      {/* 상태 — toggle (SUPER_ADMIN only) */}
                      <td className="px-4 py-3 text-center">
                        <button
                          disabled={!isSuperAdmin || isPending}
                          onClick={isSuperAdmin ? () => openToggleActive(s) : undefined}
                          title={isSuperAdmin ? (s.isActive ? "비활성화" : "활성화") : undefined}
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium transition ${
                            s.isActive
                              ? "bg-forest/10 text-forest border-forest/20"
                              : "bg-ink/5 text-slate border-ink/10"
                          } ${isSuperAdmin ? "cursor-pointer hover:opacity-70" : "cursor-default"}`}
                        >
                          {s.isActive ? "활성" : "비활성"}
                        </button>
                      </td>

                      <td className="px-4 py-3 text-center text-xs text-slate">
                        {formatLastLogin(s.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <a
                            href={`/admin/settings/staff/${s.id}/edit`}
                            className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-2.5 py-1 text-xs font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/10"
                          >
                            편집
                          </a>
                          <a
                            href={`/admin/settings/staff/${s.id}`}
                            className="text-xs text-forest hover:text-forest/70 font-medium"
                          >
                            상세 →
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      <ActionModal
        open={showInviteModal}
        badgeLabel="직원 관리"
        title="직원 초대"
        description="이메일로 직원을 초대합니다. 초대 메일이 발송되며, 직원이 수락하면 계정이 활성화됩니다."
        confirmLabel={inviteSuccess ? "닫기" : "초대 발송"}
        cancelLabel="취소"
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
                  placeholder="staff@example.com"
                  className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate">
                  이름 *
                </label>
                <input
                  type="text"
                  value={inviteForm.displayName}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                  placeholder="홍길동"
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
                    setInviteForm((f) => ({
                      ...f,
                      role: e.target.value as AdminRole,
                    }))
                  }
                  className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
                >
                  {ROLES.map((r) => (
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

      {/* Toggle Active Confirm Modal */}
      {toggleTarget && (
        <ActionModal
          open={!!toggleTarget}
          badgeLabel="직원 관리"
          badgeTone={toggleTarget.isActive ? "warning" : undefined}
          title={toggleTarget.isActive ? "계정 비활성화" : "계정 활성화"}
          description={
            toggleTarget.isActive
              ? `"${toggleTarget.name}" 계정을 비활성화합니다. 로그인이 불가해집니다.`
              : `"${toggleTarget.name}" 계정을 다시 활성화합니다.`
          }
          confirmLabel={toggleTarget.isActive ? "비활성화" : "활성화"}
          confirmTone={toggleTarget.isActive ? "danger" : undefined}
          cancelLabel="취소"
          isPending={isPending}
          onClose={() => setToggleTarget(null)}
          onConfirm={handleToggleActive}
        >
          {toggleError && (
            <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600 mt-2">
              {toggleError}
            </p>
          )}
        </ActionModal>
      )}
    </div>
  );
}
