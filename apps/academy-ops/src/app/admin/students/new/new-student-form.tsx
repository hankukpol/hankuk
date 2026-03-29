"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExamType, StudentType } from "@prisma/client";
import { EXAM_TYPE_LABEL, STUDENT_TYPE_LABEL } from "@/lib/constants";
import { todayDateInputValue } from "@/lib/format";
import { toast } from "sonner";

const EXAM_TYPE_OPTIONS: Array<{ value: ExamType; label: string }> = [
  { value: "GONGCHAE", label: EXAM_TYPE_LABEL["GONGCHAE"] },
  { value: "GYEONGCHAE", label: EXAM_TYPE_LABEL["GYEONGCHAE"] },
];

const STUDENT_TYPE_OPTIONS: Array<{ value: StudentType; label: string }> = [
  { value: "NEW", label: STUDENT_TYPE_LABEL["NEW"] },
  { value: "EXISTING", label: STUDENT_TYPE_LABEL["EXISTING"] },
];

type FormState = {
  examNumber: string;
  name: string;
  phone: string;
  birthDate: string;
  examType: ExamType;
  studentType: StudentType;
  generation: string;
  className: string;
  onlineId: string;
  registeredAt: string;
  note: string;
};

function createEmptyForm(): FormState {
  return {
    examNumber: "",
    name: "",
    phone: "",
    birthDate: "",
    examType: "GONGCHAE",
    studentType: "NEW",
    generation: "",
    className: "",
    onlineId: "",
    registeredAt: todayDateInputValue(),
    note: "",
  };
}

export function NewStudentForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(createEmptyForm);

  function patch(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit() {
    const trimmedName = form.name.trim();
    const trimmedPhone = form.phone.trim();
    const trimmedExamNumber = form.examNumber.trim();

    if (!trimmedExamNumber) {
      toast.error("학번을 입력해 주세요.");
      return;
    }

    if (!trimmedName) {
      toast.error("이름을 입력해 주세요.");
      return;
    }

    if (!trimmedPhone) {
      toast.error("연락처를 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            examNumber: trimmedExamNumber,
            name: trimmedName,
            phone: trimmedPhone,
            birthDate: form.birthDate.trim() ? new Date(form.birthDate).toISOString() : null,
            examType: form.examType,
            studentType: form.studentType,
            generation: form.generation.trim() || null,
            className: form.className.trim() || null,
            onlineId: form.onlineId.trim() || null,
            registeredAt: form.registeredAt || null,
            note: form.note.trim() || null,
          }),
        });

        const payload = (await response.json()) as {
          student?: { examNumber: string };
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "수강생 등록에 실패했습니다.");
        }

        const examNumber = payload.student?.examNumber;
        if (examNumber) {
          router.push(`/admin/students/${examNumber}`);
        } else {
          router.push("/admin/students");
        }
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "수강생 등록에 실패했습니다.");
      }
    });
  }

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8">
      {/* 기본 정보 */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-forest">기본 정보</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 학번 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              학번 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.examNumber}
              onChange={(e) => patch("examNumber", e.target.value)}
              placeholder="예) 250001"
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/50 focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            />
          </div>

          {/* 이름 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => patch("name", e.target.value)}
              placeholder="수강생 이름"
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/50 focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            />
          </div>

          {/* 연락처 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              연락처 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => patch("phone", e.target.value)}
              placeholder="010-0000-0000"
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/50 focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            />
          </div>

          {/* 생년월일 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">생년월일</label>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => patch("birthDate", e.target.value)}
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            />
          </div>
        </div>
      </section>

      {/* 수험 정보 */}
      <section className="mt-6">
        <h2 className="mb-4 text-base font-semibold text-forest">수험 정보</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 시험 유형 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              시험 유형 <span className="text-red-500">*</span>
            </label>
            <select
              value={form.examType}
              onChange={(e) => patch("examType", e.target.value)}
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            >
              {EXAM_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 학생 구분 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              학생 구분 <span className="text-red-500">*</span>
            </label>
            <select
              value={form.studentType}
              onChange={(e) => patch("studentType", e.target.value)}
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            >
              {STUDENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 기수 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">기수</label>
            <input
              type="number"
              value={form.generation}
              onChange={(e) => patch("generation", e.target.value)}
              placeholder="예) 1"
              min={1}
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/50 focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            />
          </div>

          {/* 반 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">반</label>
            <input
              type="text"
              value={form.className}
              onChange={(e) => patch("className", e.target.value)}
              placeholder="예) A"
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/50 focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            />
          </div>
        </div>
      </section>

      {/* 추가 정보 */}
      <section className="mt-6">
        <h2 className="mb-4 text-base font-semibold text-forest">추가 정보</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 등록일 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">등록일</label>
            <input
              type="date"
              value={form.registeredAt}
              onChange={(e) => patch("registeredAt", e.target.value)}
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            />
          </div>

          {/* 온라인 ID */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">온라인 ID</label>
            <input
              type="text"
              value={form.onlineId}
              onChange={(e) => patch("onlineId", e.target.value)}
              placeholder="인강 플랫폼 ID (선택)"
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/50 focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
            />
          </div>
        </div>

        {/* 메모 */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-ink">메모</label>
          <textarea
            value={form.note}
            onChange={(e) => patch("note", e.target.value)}
            rows={3}
            placeholder="학생 관련 메모 (선택)"
            disabled={isPending}
            className="w-full resize-none rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/50 focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/10 disabled:bg-mist"
          />
        </div>
      </section>

      {/* 버튼 */}
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "등록 중..." : "수강생 등록"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/students")}
          disabled={isPending}
          className="inline-flex items-center rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
