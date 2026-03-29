"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminRole, StaffRole } from "@prisma/client";

// ─── Labels ──────────────────────────────────────────────────────────────────

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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StaffEditData {
  id: string;
  name: string;
  phone: string | null;
  role: AdminRole;
  isActive: boolean;
  staffRole: string | null;
  shareRatio: number | null;
}

interface FormState {
  name: string;
  phone: string;
  role: AdminRole;
  staffRole: StaffRole | "";
  isActive: boolean;
  shareRatio: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StaffEditForm({ data }: { data: StaffEditData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    name: data.name,
    phone: data.phone ?? "",
    role: data.role,
    staffRole: (data.staffRole as StaffRole) ?? "",
    isActive: data.isActive,
    shareRatio: data.shareRatio !== null ? String(data.shareRatio) : "",
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("이름을 입력하세요.");
      return;
    }
    const shareRatioNum = form.shareRatio.trim()
      ? Number(form.shareRatio.trim())
      : null;
    if (
      shareRatioNum !== null &&
      (isNaN(shareRatioNum) || shareRatioNum < 0 || shareRatioNum > 100)
    ) {
      setError("배분율은 0에서 100 사이의 숫자를 입력하세요.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/settings/staff/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            role: form.role,
            staffRole: form.staffRole || null,
            isActive: form.isActive,
            shareRatio: shareRatioNum,
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "수정 실패");
        setToast("저장되었습니다.");
        setTimeout(() => {
          router.push("/admin/settings/staff");
          router.refresh();
        }, 800);
      } catch (err) {
        setError(err instanceof Error ? err.message : "수정 실패");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {toast && (
        <div className="rounded-[12px] bg-forest/10 border border-forest/20 px-4 py-3 text-sm text-forest">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-[12px] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 이름 */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">
          이름 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm text-ink placeholder:text-slate/50 outline-none focus:border-forest focus:ring-1 focus:ring-forest/30 transition"
          placeholder="직원 이름"
        />
      </div>

      {/* 연락처 */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">연락처</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm text-ink placeholder:text-slate/50 outline-none focus:border-forest focus:ring-1 focus:ring-forest/30 transition"
          placeholder="010-0000-0000"
        />
      </div>

      {/* 시스템 권한 */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">
          시스템 권한 <span className="text-red-500">*</span>
        </label>
        <select
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm text-ink outline-none focus:border-forest focus:ring-1 focus:ring-forest/30 transition"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate">
          본인보다 높거나 같은 권한은 부여할 수 없습니다.
        </p>
      </div>

      {/* 직무 */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">직무 (선택)</label>
        <select
          value={form.staffRole}
          onChange={(e) =>
            setForm((f) => ({ ...f, staffRole: e.target.value as StaffRole | "" }))
          }
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm text-ink outline-none focus:border-forest focus:ring-1 focus:ring-forest/30 transition"
        >
          <option value="">선택 안함</option>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {STAFF_ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      {/* 배분율 */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">
          배분율 (%)
        </label>
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={form.shareRatio}
          onChange={(e) => setForm((f) => ({ ...f, shareRatio: e.target.value }))}
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm text-ink placeholder:text-slate/50 outline-none focus:border-forest focus:ring-1 focus:ring-forest/30 transition"
          placeholder="예: 70 (0~100)"
        />
        <p className="mt-1 text-xs text-slate">
          강사 수납 배분율 (%). 빈 칸이면 저장하지 않습니다.
        </p>
      </div>

      {/* 계정 활성화 여부 */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">계정 상태</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.isActive}
            onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-forest/50 ${
              form.isActive ? "bg-forest" : "bg-ink/20"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                form.isActive ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${form.isActive ? "text-forest" : "text-slate"}`}>
            {form.isActive ? "활성" : "비활성"}
          </span>
        </div>
        {!form.isActive && (
          <p className="mt-1.5 text-xs text-amber-600">
            비활성화하면 해당 직원의 로그인이 불가능해집니다.
          </p>
        )}
      </div>

      {/* 버튼 */}
      <div className="flex items-center gap-3 pt-2 border-t border-ink/10">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
        >
          {isPending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              저장 중...
            </>
          ) : (
            "저장"
          )}
        </button>
        <a
          href="/admin/settings/staff"
          className="inline-flex items-center rounded-full border border-ink/20 px-6 py-2.5 text-sm font-medium text-slate transition hover:border-ink/40 hover:text-ink"
        >
          취소
        </a>
      </div>
    </form>
  );
}
