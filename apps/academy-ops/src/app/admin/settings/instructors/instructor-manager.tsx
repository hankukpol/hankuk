"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionModal } from "@/components/ui/action-modal";
import type { InstructorRow } from "./page";

interface InstructorForm {
  name: string;
  subject: string;
  phone: string;
  email: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  isActive: boolean;
}

const EMPTY_FORM: InstructorForm = {
  name: "",
  subject: "",
  phone: "",
  email: "",
  bankName: "",
  bankAccount: "",
  bankHolder: "",
  isActive: true,
};

interface Props {
  initialInstructors: InstructorRow[];
}

export function InstructorManager({ initialInstructors }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InstructorRow | null>(null);
  const [form, setForm] = useState<InstructorForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const displayed = showInactive ? initialInstructors : initialInstructors.filter((i) => i.isActive);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setCreateOpen(true);
  }

  function openEdit(i: InstructorRow) {
    setForm({
      name: i.name,
      subject: i.subject,
      phone: i.phone ?? "",
      email: i.email ?? "",
      bankName: i.bankName ?? "",
      bankAccount: i.bankAccount ?? "",
      bankHolder: i.bankHolder ?? "",
      isActive: i.isActive,
    });
    setError(null);
    setEditTarget(i);
  }

  function handleCreate() {
    if (!form.name.trim() || !form.subject.trim()) {
      setError("이름과 담당 과목을 입력하세요."); return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/instructors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            subject: form.subject.trim(),
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            bankName: form.bankName.trim() || null,
            bankAccount: form.bankAccount.trim() || null,
            bankHolder: form.bankHolder.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "생성 실패");
        setCreateOpen(false);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "생성 실패"); }
    });
  }

  function handleEdit() {
    if (!editTarget || !form.name.trim() || !form.subject.trim()) {
      setError("이름과 담당 과목을 입력하세요."); return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/instructors/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            subject: form.subject.trim(),
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            bankName: form.bankName.trim() || null,
            bankAccount: form.bankAccount.trim() || null,
            bankHolder: form.bankHolder.trim() || null,
            isActive: form.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        setEditTarget(null);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "수정 실패"); }
    });
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 text-sm text-slate cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-ink/20"
          />
          비활성 강사 포함
        </label>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/settings/instructors/new"
            className="rounded-[28px] bg-ember px-4 py-2 text-sm font-semibold text-white hover:bg-ember/90"
          >
            새 강사 등록
          </Link>
          <button
            onClick={openCreate}
            className="rounded-[28px] bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
          >
            + 강사 추가
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayed.length === 0 ? (
          <div className="col-span-3 rounded-[20px] border border-ink/10 py-12 text-center text-sm text-slate">
            등록된 강사가 없습니다.
          </div>
        ) : (
          displayed.map((i) => (
            <div key={i.id} className={`rounded-[20px] border border-ink/10 bg-white p-5 ${!i.isActive ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-ink">{i.name}</p>
                  <p className="text-xs text-slate mt-0.5">{i.subject}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!i.isActive && (
                    <span className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs text-slate">비활성</span>
                  )}
                  <Link
                    href={`/admin/settings/instructors/${i.id}`}
                    className="text-xs text-slate hover:text-ember"
                  >
                    상세
                  </Link>
                  <Link
                    href={`/admin/settings/instructors/${i.id}/settlements`}
                    className="text-xs text-slate hover:text-forest"
                  >
                    정산
                  </Link>
                  <button
                    onClick={() => openEdit(i)}
                    className="text-xs text-slate hover:text-ink"
                  >
                    수정
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate">
                {i.phone && <p>📞 {i.phone}</p>}
                {i.email && <p>✉️ {i.email}</p>}
                {i.bankName && i.bankAccount && (
                  <p className="truncate">🏦 {i.bankName} {i.bankAccount}{i.bankHolder ? ` (${i.bankHolder})` : ""}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      <ActionModal
        open={createOpen}
        badgeLabel="강사 관리"
        title="강사 추가"
        description="새 강사 정보를 등록합니다."
        confirmLabel="추가"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        panelClassName="max-w-md"
      >
        <InstructorForm form={form} onChange={setForm} error={error} />
      </ActionModal>

      {/* Edit Modal */}
      <ActionModal
        open={!!editTarget}
        badgeLabel="강사 관리"
        title="강사 정보 수정"
        description={`"${editTarget?.name}" 정보를 수정합니다.`}
        confirmLabel="저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEdit}
        panelClassName="max-w-md"
      >
        <InstructorForm form={form} onChange={setForm} error={error} showActive />
      </ActionModal>
    </div>
  );
}

function InstructorForm({
  form,
  onChange,
  error,
  showActive = false,
}: {
  form: InstructorForm;
  onChange: (f: InstructorForm) => void;
  error: string | null;
  showActive?: boolean;
}) {
  return (
    <div className="space-y-3 pt-2">
      {error && <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">이름 *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="홍길동"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">담당 과목 *</label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => onChange({ ...form, subject: e.target.value })}
            placeholder="예: 형사법"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">연락처</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => onChange({ ...form, phone: e.target.value })}
            placeholder="010-0000-0000"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">이메일</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => onChange({ ...form, email: e.target.value })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      </div>
      <p className="text-xs font-medium text-slate pt-1">정산 계좌</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">은행명</label>
          <input
            type="text"
            value={form.bankName}
            onChange={(e) => onChange({ ...form, bankName: e.target.value })}
            placeholder="예: 국민은행"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">예금주</label>
          <input
            type="text"
            value={form.bankHolder}
            onChange={(e) => onChange({ ...form, bankHolder: e.target.value })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate">계좌번호</label>
        <input
          type="text"
          value={form.bankAccount}
          onChange={(e) => onChange({ ...form, bankAccount: e.target.value })}
          placeholder="000-0000-0000000"
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      </div>
      {showActive && (
        <label className="flex items-center gap-2 text-sm text-slate cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
            className="rounded border-ink/20"
          />
          활성 상태
        </label>
      )}
    </div>
  );
}
