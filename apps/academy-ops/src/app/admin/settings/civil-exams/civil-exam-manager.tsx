"use client";

import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import type { CivilExamRow } from "./page";

type Props = {
  initialExams: CivilExamRow[];
};

type ExamForm = {
  name: string;
  examType: "GONGCHAE" | "GYEONGCHAE";
  year: string;
  writtenDate: string;
  interviewDate: string;
  resultDate: string;
  description: string;
  isActive: boolean;
};

const EMPTY_FORM: ExamForm = {
  name: "",
  examType: "GONGCHAE",
  year: String(new Date().getFullYear()),
  writtenDate: "",
  interviewDate: "",
  resultDate: "",
  description: "",
  isActive: true,
};

const EXAM_TYPE_LABELS: Record<"GONGCHAE" | "GYEONGCHAE", string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return iso.replace(/-/g, ".");
}

export function CivilExamManager({ initialExams }: Props) {
  const [exams, setExams] = useState(initialExams);
  const [form, setForm] = useState<ExamForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setIsCreateModalOpen(true);
  }

  function openEdit(exam: CivilExamRow) {
    setEditingId(exam.id);
    setForm({
      name: exam.name,
      examType: exam.examType,
      year: String(exam.year),
      writtenDate: exam.writtenDate ?? "",
      interviewDate: exam.interviewDate ?? "",
      resultDate: exam.resultDate ?? "",
      description: exam.description ?? "",
      isActive: exam.isActive,
    });
    setError(null);
    setIsEditModalOpen(true);
  }

  function openDelete(id: number) {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/settings/civil-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          examType: form.examType,
          year: Number(form.year),
          writtenDate: form.writtenDate || null,
          interviewDate: form.interviewDate || null,
          resultDate: form.resultDate || null,
          description: form.description,
          isActive: form.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "등록 실패");
        return;
      }
      const exam = data.exam;
      setExams((prev) => [
        {
          ...exam,
          writtenDate: exam.writtenDate ? exam.writtenDate.split("T")[0] : null,
          interviewDate: exam.interviewDate ? exam.interviewDate.split("T")[0] : null,
          resultDate: exam.resultDate ? exam.resultDate.split("T")[0] : null,
        },
        ...prev,
      ]);
      setIsCreateModalOpen(false);
    });
  }

  function handleEdit() {
    if (!editingId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/settings/civil-exams/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          examType: form.examType,
          year: Number(form.year),
          writtenDate: form.writtenDate || null,
          interviewDate: form.interviewDate || null,
          resultDate: form.resultDate || null,
          description: form.description,
          isActive: form.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "수정 실패");
        return;
      }
      const exam = data.exam;
      setExams((prev) =>
        prev.map((e) =>
          e.id === editingId
            ? {
                ...e,
                ...exam,
                writtenDate: exam.writtenDate ? exam.writtenDate.split("T")[0] : null,
                interviewDate: exam.interviewDate ? exam.interviewDate.split("T")[0] : null,
                resultDate: exam.resultDate ? exam.resultDate.split("T")[0] : null,
              }
            : e,
        ),
      );
      setIsEditModalOpen(false);
    });
  }

  function handleDelete() {
    if (!deletingId) return;
    startTransition(async () => {
      const res = await fetch(`/api/settings/civil-exams/${deletingId}`, { method: "DELETE" });
      if (!res.ok) return;
      setExams((prev) => prev.filter((e) => e.id !== deletingId));
      setIsDeleteModalOpen(false);
    });
  }

  const activeExams = exams.filter((e) => e.isActive);
  const inactiveExams = exams.filter((e) => !e.isActive);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          총 {exams.length}개 시험 일정 ({activeExams.length}개 활성)
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
        >
          + 시험 추가
        </button>
      </div>

      {exams.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          등록된 시험 일정이 없습니다.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-5 py-3.5 font-semibold">시험명</th>
                <th className="px-5 py-3.5 font-semibold">유형</th>
                <th className="px-5 py-3.5 font-semibold">연도</th>
                <th className="px-5 py-3.5 font-semibold">필기</th>
                <th className="px-5 py-3.5 font-semibold">면접</th>
                <th className="px-5 py-3.5 font-semibold">최종발표</th>
                <th className="px-5 py-3.5 font-semibold">상태</th>
                <th className="px-5 py-3.5 font-semibold text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {[...activeExams, ...inactiveExams].map((exam) => (
                <tr key={exam.id} className={exam.isActive ? "" : "opacity-50"}>
                  <td className="px-5 py-3.5 font-medium">{exam.name}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                        exam.examType === "GONGCHAE"
                          ? "border-forest/20 bg-forest/10 text-forest"
                          : "border-ember/20 bg-ember/10 text-ember"
                      }`}
                    >
                      {EXAM_TYPE_LABELS[exam.examType]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">{exam.year}년</td>
                  <td className="px-5 py-3.5 text-slate">{formatDate(exam.writtenDate)}</td>
                  <td className="px-5 py-3.5 text-slate">{formatDate(exam.interviewDate)}</td>
                  <td className="px-5 py-3.5 text-slate">{formatDate(exam.resultDate)}</td>
                  <td className="px-5 py-3.5">
                    {exam.isActive ? (
                      <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                        활성
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(exam)}
                      className="mr-3 text-xs font-semibold text-slate transition hover:text-ink"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => openDelete(exam.id)}
                      className="text-xs font-semibold text-ember transition hover:text-red-600"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 시험 추가 모달 */}
      <ActionModal
        open={isCreateModalOpen}
        badgeLabel="시험 관리"
        title="시험 일정 추가"
        description="새 시험 일정을 등록합니다."
        confirmLabel="추가"
        cancelLabel="취소"
        onClose={() => setIsCreateModalOpen(false)}
        onConfirm={handleCreate}
        isPending={isPending}
      >
        <ExamFormFields form={form} onChange={setForm} error={error} />
      </ActionModal>

      {/* 시험 수정 모달 */}
      <ActionModal
        open={isEditModalOpen}
        badgeLabel="시험 관리"
        title="시험 일정 수정"
        description="시험 일정 정보를 수정합니다."
        confirmLabel="저장"
        cancelLabel="취소"
        onClose={() => setIsEditModalOpen(false)}
        onConfirm={handleEdit}
        isPending={isPending}
      >
        <ExamFormFields form={form} onChange={setForm} error={error} showActiveToggle />
      </ActionModal>

      {/* 삭제 확인 모달 */}
      <ActionModal
        open={isDeleteModalOpen}
        badgeLabel="시험 관리"
        title="시험 일정 삭제"
        description="이 시험 일정을 삭제하시겠습니까?"
        confirmLabel="삭제"
        cancelLabel="취소"
        confirmTone="danger"
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}

function ExamFormFields({
  form,
  onChange,
  error,
  showActiveToggle = false,
}: {
  form: ExamForm;
  onChange: (form: ExamForm) => void;
  error: string | null;
  showActiveToggle?: boolean;
}) {
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate mb-1.5">시험 유형 *</label>
          <select
            value={form.examType}
            onChange={(e) => onChange({ ...form, examType: e.target.value as "GONGCHAE" | "GYEONGCHAE" })}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          >
            <option value="GONGCHAE">공채</option>
            <option value="GYEONGCHAE">경채</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate mb-1.5">연도 *</label>
          <input
            type="number"
            value={form.year}
            onChange={(e) => onChange({ ...form, year: e.target.value })}
            placeholder="예: 2026"
            min={2020}
            max={2099}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate mb-1.5">시험명 *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="예: 2026년 경찰공무원 공개경쟁채용"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate mb-1.5">필기시험일</label>
          <input
            type="date"
            value={form.writtenDate}
            onChange={(e) => onChange({ ...form, writtenDate: e.target.value })}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate mb-1.5">면접시험일</label>
          <input
            type="date"
            value={form.interviewDate}
            onChange={(e) => onChange({ ...form, interviewDate: e.target.value })}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate mb-1.5">최종발표일</label>
          <input
            type="date"
            value={form.resultDate}
            onChange={(e) => onChange({ ...form, resultDate: e.target.value })}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate mb-1.5">설명 (선택)</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="예: 1차 필기 합격자 발표 후 체력·면접 진행"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>
      {showActiveToggle && (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="exam-isActive"
            checked={form.isActive}
            onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
            className="h-4 w-4 rounded"
          />
          <label htmlFor="exam-isActive" className="text-sm">
            활성 (합격자 등록 화면에 표시)
          </label>
        </div>
      )}
    </div>
  );
}
