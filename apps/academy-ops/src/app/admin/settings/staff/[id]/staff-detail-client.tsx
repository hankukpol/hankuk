"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminRole, StaffRole } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import type { StaffDetail } from "./page";

// ─── Labels ─────────────────────────────────────────────────────────────────

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

const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

const STAFF_ROLES: StaffRole[] = [
  StaffRole.OWNER,
  StaffRole.DIRECTOR,
  StaffRole.DEPUTY_DIRECTOR,
  StaffRole.MANAGER,
  StaffRole.ACADEMIC_ADMIN,
  StaffRole.COUNSELOR,
  StaffRole.TEACHER,
];

// ─── Permission Matrix ───────────────────────────────────────────────────────
// [label, minRole required to access]
const PERMISSION_ITEMS: Array<{ label: string; minRole: AdminRole }> = [
  { label: "학생 조회", minRole: AdminRole.VIEWER },
  { label: "성적 조회", minRole: AdminRole.VIEWER },
  { label: "출결 조회", minRole: AdminRole.VIEWER },
  { label: "성적 입력/수정", minRole: AdminRole.TEACHER },
  { label: "수강 상담", minRole: AdminRole.COUNSELOR },
  { label: "수납 처리", minRole: AdminRole.COUNSELOR },
  { label: "수강 등록", minRole: AdminRole.COUNSELOR },
  { label: "강좌/기수 관리", minRole: AdminRole.MANAGER },
  { label: "직원 조회", minRole: AdminRole.MANAGER },
  { label: "환불 승인", minRole: AdminRole.MANAGER },
  { label: "포인트 관리", minRole: AdminRole.MANAGER },
  { label: "급여/정산 조회", minRole: AdminRole.DIRECTOR },
  { label: "직원 권한 변경", minRole: AdminRole.SUPER_ADMIN },
  { label: "시스템 설정", minRole: AdminRole.SUPER_ADMIN },
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

function hasPermission(userRole: AdminRole, minRole: AdminRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return "없음";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ko });
  } catch {
    return "-";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  detail: StaffDetail;
  isSuperAdmin: boolean;
  isSelf: boolean;
}

interface EditForm {
  name: string;
  phone: string;
  role: AdminRole;
  staffRole: StaffRole | "";
}

export function StaffDetailClient({ detail, isSuperAdmin, isSelf }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [current, setCurrent] = useState<StaffDetail>(detail);

  // Edit modal
  const [showEdit, setShowEdit] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: detail.name,
    phone: detail.phone ?? "",
    role: detail.role,
    staffRole: (detail.staffRole as StaffRole) ?? "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Toggle active modal
  const [showToggleActive, setShowToggleActive] = useState<boolean>(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  function openEdit() {
    setEditForm({
      name: current.name,
      phone: current.phone ?? "",
      role: current.role,
      staffRole: (current.staffRole as StaffRole) ?? "",
    });
    setEditError(null);
    setShowEdit(true);
  }

  function handleSaveEdit() {
    if (!editForm.name.trim()) {
      setEditError("이름을 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/settings/staff/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editForm.name.trim(),
            phone: editForm.phone.trim() || null,
            role: editForm.role,
            staffRole: editForm.staffRole || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        setCurrent((prev) => ({
          ...prev,
          name: data.data.name,
          phone: data.data.phone,
          role: data.data.role,
          staffRole: data.data.staff?.role ?? prev.staffRole,
        }));
        setShowEdit(false);
        router.refresh();
      } catch (e) {
        setEditError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/settings/staff/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !current.isActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "처리 실패");
        setCurrent((prev) => ({ ...prev, isActive: !prev.isActive }));
        setShowToggleActive(false);
        router.refresh();
      } catch (e) {
        setToggleError(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  const canEdit = isSuperAdmin && !isSelf;
  const canToggle = isSuperAdmin && !isSelf;

  return (
    <div className="space-y-6">
      {/* Main info card */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-ink">{current.name}</h2>
            <p className="mt-1 text-sm text-slate">{current.email}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${ROLE_COLOR[current.role]}`}
            >
              {ROLE_LABEL[current.role]}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                current.isActive
                  ? "bg-forest/10 text-forest border-forest/20"
                  : "bg-ink/5 text-slate border-ink/10"
              }`}
            >
              {current.isActive ? "활성" : "비활성"}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Name */}
          <div>
            <p className="text-xs font-medium text-slate">이름</p>
            <p className="mt-1 text-sm font-medium text-ink">{current.name}</p>
          </div>
          {/* Email */}
          <div>
            <p className="text-xs font-medium text-slate">이메일</p>
            <p className="mt-1 text-sm text-ink">{current.email}</p>
          </div>
          {/* Phone */}
          <div>
            <p className="text-xs font-medium text-slate">연락처</p>
            <p className="mt-1 text-sm text-ink">{current.phone ?? "-"}</p>
          </div>
          {/* Role */}
          <div>
            <p className="text-xs font-medium text-slate">시스템 권한</p>
            <p className="mt-1 text-sm text-ink">
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[current.role]}`}
              >
                {ROLE_LABEL[current.role]}
              </span>
            </p>
          </div>
          {/* Staff Role */}
          <div>
            <p className="text-xs font-medium text-slate">직무</p>
            <p className="mt-1 text-sm text-ink">
              {current.staffRole
                ? STAFF_ROLE_LABEL[current.staffRole as StaffRole] ?? current.staffRole
                : "-"}
            </p>
          </div>
          {/* Last Login */}
          <div>
            <p className="text-xs font-medium text-slate">마지막 로그인</p>
            <p className="mt-1 text-sm text-ink">
              {formatLastLogin(current.lastLoginAt)}
            </p>
          </div>
          {/* Created */}
          <div>
            <p className="text-xs font-medium text-slate">등록일</p>
            <p className="mt-1 text-sm text-ink">{formatDate(current.createdAt)}</p>
          </div>
          {/* Updated */}
          <div>
            <p className="text-xs font-medium text-slate">최종 수정</p>
            <p className="mt-1 text-sm text-ink">{formatDate(current.updatedAt)}</p>
          </div>
        </div>

        {/* Actions */}
        {(canEdit || canToggle) && (
          <div className="mt-8 flex items-center gap-3 flex-wrap border-t border-ink/10 pt-6">
            {canEdit && (
              <button
                onClick={openEdit}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
              >
                역할·직무 변경 저장
              </button>
            )}
            {canToggle && (
              <button
                onClick={() => {
                  setToggleError(null);
                  setShowToggleActive(true);
                }}
                disabled={isPending}
                className={`inline-flex items-center rounded-full border px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
                  current.isActive
                    ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                    : "border-forest/20 bg-forest/5 text-forest hover:bg-forest/10"
                }`}
              >
                {current.isActive ? "계정 비활성화" : "계정 활성화"}
              </button>
            )}
          </div>
        )}

        {isSelf && (
          <p className="mt-4 rounded-[12px] bg-amber-50 px-4 py-2 text-xs text-amber-700">
            본인 계정의 권한과 활성화 상태는 변경할 수 없습니다.
          </p>
        )}
      </div>

      {/* Permission Summary Card */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-8">
        <h3 className="text-base font-semibold text-ink mb-4">권한 요약</h3>
        <p className="text-xs text-slate mb-6">
          현재 역할({ROLE_LABEL[current.role]})의 접근 가능 기능을 표시합니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PERMISSION_ITEMS.map(({ label, minRole }) => {
            const allowed = hasPermission(current.role, minRole);
            return (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-[12px] border px-3 py-2 text-sm ${
                  allowed
                    ? "border-forest/20 bg-forest/5 text-forest"
                    : "border-ink/10 bg-mist/40 text-slate/50"
                }`}
              >
                <span className="font-semibold">{allowed ? "✓" : "✗"}</span>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Modal */}
      <ActionModal
        open={showEdit}
        badgeLabel="직원 관리"
        title="역할·직무 변경"
        description={`"${current.name}" 계정의 권한 역할과 직무를 변경합니다.`}
        confirmLabel="저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setShowEdit(false)}
        onConfirm={handleSaveEdit}
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
            <label className="mb-1 block text-xs font-medium text-slate">시스템 권한 *</label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">직무 (선택)</label>
            <select
              value={editForm.staffRole}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, staffRole: e.target.value as StaffRole | "" }))
              }
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            >
              <option value="">선택 안함</option>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {STAFF_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ActionModal>

      {/* Toggle Active Modal */}
      <ActionModal
        open={showToggleActive}
        badgeLabel="직원 관리"
        badgeTone={current.isActive ? "warning" : undefined}
        title={current.isActive ? "계정 비활성화" : "계정 활성화"}
        description={
          current.isActive
            ? `"${current.name}" 계정을 비활성화합니다. 로그인이 불가해집니다.`
            : `"${current.name}" 계정을 다시 활성화합니다.`
        }
        confirmLabel={current.isActive ? "비활성화" : "활성화"}
        confirmTone={current.isActive ? "danger" : undefined}
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setShowToggleActive(false)}
        onConfirm={handleToggleActive}
      >
        {toggleError && (
          <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600 mt-2">
            {toggleError}
          </p>
        )}
      </ActionModal>
    </div>
  );
}
