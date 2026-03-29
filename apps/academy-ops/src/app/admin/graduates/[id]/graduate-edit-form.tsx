"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PassType } from "@prisma/client";
import type { GraduateDetail } from "./page";

const PASS_TYPE_LABEL: Record<PassType, string> = {
  WRITTEN_PASS: "필기합격",
  FINAL_PASS: "최종합격",
  APPOINTED: "임용",
  WRITTEN_FAIL: "필기불합격",
  FINAL_FAIL: "최종불합격",
};

const ALL_PASS_TYPES = Object.keys(PASS_TYPE_LABEL) as PassType[];

interface EditForm {
  examName: string;
  passType: PassType;
  writtenPassDate: string;
  finalPassDate: string;
  appointedDate: string;
  enrolledMonths: string;
  testimony: string;
  isPublic: boolean;
  note: string;
}

interface Props {
  detail: GraduateDetail;
  onClose: () => void;
}

export function GraduateEditForm({ detail, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<EditForm>({
    examName: detail.examName,
    passType: detail.passType,
    writtenPassDate: detail.writtenPassDate ? detail.writtenPassDate.slice(0, 10) : "",
    finalPassDate: detail.finalPassDate ? detail.finalPassDate.slice(0, 10) : "",
    appointedDate: detail.appointedDate ? detail.appointedDate.slice(0, 10) : "",
    enrolledMonths: detail.enrolledMonths != null ? String(detail.enrolledMonths) : "",
    testimony: detail.testimony ?? "",
    isPublic: detail.isPublic,
    note: detail.note ?? "",
  });

  function handleSubmit() {
    if (!form.examName.trim() || !form.passType) {
      setError("시험명과 합격 구분은 필수입니다.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/graduates/${detail.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examName: form.examName.trim(),
            passType: form.passType,
            writtenPassDate: form.writtenPassDate || null,
            finalPassDate: form.finalPassDate || null,
            appointedDate: form.appointedDate || null,
            enrolledMonths: form.enrolledMonths ? Number(form.enrolledMonths) : null,
            testimony: form.testimony || null,
            isPublic: form.isPublic,
            note: form.note || null,
          }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold">합격 정보 수정</h2>
        <button
          onClick={onClose}
          className="rounded-full px-3 py-1 text-xs text-slate hover:text-ink transition-colors"
        >
          취소
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-[12px] bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
      )}

      <div className="space-y-4">
        {/* 시험명 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">시험명 *</label>
          <input
            type="text"
            value={form.examName}
            onChange={(e) => setForm({ ...form, examName: e.target.value })}
            placeholder="예: 2026 경찰공무원(순경) 공채"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>

        {/* 합격 구분 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">합격 구분 *</label>
          <select
            value={form.passType}
            onChange={(e) => setForm({ ...form, passType: e.target.value as PassType })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          >
            {ALL_PASS_TYPES.map((k) => (
              <option key={k} value={k}>
                {PASS_TYPE_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        {/* 날짜 필드 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">필기 합격일</label>
            <input
              type="date"
              value={form.writtenPassDate}
              onChange={(e) => setForm({ ...form, writtenPassDate: e.target.value })}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">최종 합격일</label>
            <input
              type="date"
              value={form.finalPassDate}
              onChange={(e) => setForm({ ...form, finalPassDate: e.target.value })}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">임용일</label>
            <input
              type="date"
              value={form.appointedDate}
              onChange={(e) => setForm({ ...form, appointedDate: e.target.value })}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
        </div>

        {/* 수강 기간 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">수강 기간 (개월)</label>
          <input
            type="number"
            min="1"
            max="60"
            value={form.enrolledMonths}
            onChange={(e) => setForm({ ...form, enrolledMonths: e.target.value })}
            placeholder="예: 18"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>

        {/* 합격 수기 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">합격 수기 (선택)</label>
          <textarea
            value={form.testimony}
            onChange={(e) => setForm({ ...form, testimony: e.target.value })}
            rows={4}
            placeholder="합격자의 공부 후기를 입력합니다."
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest resize-none"
          />
        </div>

        {/* 포털 공개 */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate">
          <input
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
            className="rounded border-ink/20"
          />
          수기 공개 (학생 포털에 노출)
        </label>

        {/* 내부 메모 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">내부 메모 (선택)</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="관리자 내부 메모"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      </div>

      {/* 버튼 */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={isPending}
          className="rounded-[20px] border border-ink/20 px-5 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-50"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-[20px] bg-ember px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ember/90 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
