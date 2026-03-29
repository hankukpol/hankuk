"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import useConfirmModal from "@/hooks/useConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ADMIN_EXAM_API = "/api/admin/exam?feature=exams";

interface ExamItem {
  id: number;
  name: string;
  year: number;
  round: number;
  examDate: string;
  isActive: boolean;
  _count: {
    answerKeys: number;
    submissions: number;
  };
}

interface ExamsResponse {
  exams: ExamItem[];
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

function formatDateForInput(dateText: string): string {
  if (!dateText) return "";
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, "0")}-${`${parsed.getDate()}`.padStart(2, "0")}`;
}

function formatDateForView(dateText: string): string {
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("ko-KR");
}

export default function AdminExamsPage() {
  const { enabled: examsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("exams");
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [round, setRound] = useState("");
  const [examDate, setExamDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const { confirm, modalProps } = useConfirmModal();

  const isEditing = editingId !== null;

  const sortedExams = useMemo(() => {
    return [...exams].sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }
      if (a.year !== b.year) {
        return b.year - a.year;
      }
      if (a.round !== b.round) {
        return b.round - a.round;
      }
      return b.id - a.id;
    });
  }, [exams]);

  async function loadExams() {
    setIsLoading(true);
    try {
      const response = await fetch(ADMIN_EXAM_API, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as ExamsResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "시험 목록을 불러오지 못했습니다.");
      }
      setExams(data.exams ?? []);
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "시험 목록 조회에 실패했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!examsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    void loadExams();
  }, [examsEnabled, isFeatureLoading]);

  if (isFeatureLoading || (examsEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">관리 화면을 불러오는 중입니다...</p>;
  }

  if (!examsEnabled) {
    return <AdminFeatureDisabledState feature="exams" />;
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setYear("");
    setRound("");
    setExamDate("");
    setIsActive(true);
  }

  function startEdit(exam: ExamItem) {
    setEditingId(exam.id);
    setName(exam.name);
    setYear(String(exam.year));
    setRound(String(exam.round));
    setExamDate(formatDateForInput(exam.examDate));
    setIsActive(exam.isActive);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const yearNumber = Number(year);
    const roundNumber = Number(round);

    if (!name.trim()) {
      setNotice({ type: "error", message: "시험명을 입력해 주세요." });
      return;
    }

    if (!Number.isInteger(yearNumber) || !Number.isInteger(roundNumber) || !examDate) {
      setNotice({ type: "error", message: "연도, 회차, 시험일을 올바르게 입력해 주세요." });
      return;
    }

    const ok = await confirm({
      title: isEditing ? "시험 수정" : "시험 생성",
      description: isEditing
        ? "시험 정보를 수정하시겠습니까?"
        : "새 시험을 생성하시겠습니까?",
    });
    if (!ok) return;

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        year: yearNumber,
        round: roundNumber,
        examDate,
        isActive,
      };

      const endpoint = isEditing ? `${ADMIN_EXAM_API}&id=${editingId}` : ADMIN_EXAM_API;
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "시험 저장에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: isEditing ? "시험 정보가 수정되었습니다." : "시험이 생성되었습니다.",
      });
      resetForm();
      await loadExams();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "시험 저장 중 오류가 발생했습니다.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleActivation(exam: ExamItem) {
    const ok = await confirm({
      title: exam.isActive ? "시험 비활성화" : "시험 활성화",
      description: exam.isActive
        ? `"${exam.year}년 ${exam.round}차" 시험을 비활성화하시겠습니까?`
        : `"${exam.year}년 ${exam.round}차" 시험을 활성화하시겠습니까?`,
      variant: exam.isActive ? "danger" : "default",
    });
    if (!ok) return;

    setNotice(null);
    try {
      const response = await fetch(`${ADMIN_EXAM_API}&id=${exam.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !exam.isActive,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "활성화 상태 변경에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: !exam.isActive ? "시험이 활성화되었습니다." : "시험이 비활성화되었습니다.",
      });
      await loadExams();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "활성화 상태 변경 중 오류가 발생했습니다.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">시험 관리</h1>
        <p className="mt-1 text-sm text-slate-600">시험 생성, 수정, 활성화 전환을 관리합니다.</p>
      </header>

      <form className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="exam-name">시험명</Label>
            <Input
              id="exam-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 2026년 소방공무원 채용시험"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-year">연도</Label>
            <Input
              id="exam-year"
              type="number"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              placeholder="2026"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-round">회차</Label>
            <Input
              id="exam-round"
              type="number"
              value={round}
              onChange={(event) => setRound(event.target.value)}
              placeholder="1"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-date">시험일</Label>
            <Input
              id="exam-date"
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            저장 후 활성 시험으로 설정
          </label>
        </div>

        {notice ? (
          <p
            className={`rounded-md px-3 py-2 text-sm ${
              notice.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {notice.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "저장 중..." : isEditing ? "시험 수정" : "시험 생성"}
          </Button>
          {isEditing ? (
            <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
              새 시험 입력
            </Button>
          ) : null}
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">등록된 시험</h2>
        {isLoading ? (
          <p className="text-sm text-slate-600">목록을 불러오는 중입니다...</p>
        ) : sortedExams.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
            등록된 시험이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">시험</th>
                  <th className="px-4 py-3">시험일</th>
                  <th className="px-4 py-3">정답 문항</th>
                  <th className="px-4 py-3">제출 수</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3 text-right">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedExams.map((exam) => (
                  <tr key={exam.id} className="bg-white">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {exam.year}년 {exam.round}차
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{exam.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDateForView(exam.examDate)}</td>
                    <td className="px-4 py-3 text-slate-700">{exam._count.answerKeys}</td>
                    <td className="px-4 py-3 text-slate-700">{exam._count.submissions}</td>
                    <td className="px-4 py-3">
                      {exam.isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                          활성
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                          비활성
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(exam)}>
                          수정
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void toggleActivation(exam)}>
                          {exam.isActive ? "비활성화" : "활성화"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
