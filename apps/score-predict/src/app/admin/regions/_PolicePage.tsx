"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ExamItem {
  id: number;
  name: string;
  year: number;
  round: number;
  isActive: boolean;
}

interface PoliceRegionRow {
  id: number;
  name: string;
  isActive: boolean;
  recruitCount: number;
  recruitCountCareer: number;
  applicantCount: number | null;
  applicantCountCareer: number | null;
  examNumberStart: string | null;
  examNumberEnd: string | null;
  examNumberStartCareer: string | null;
  examNumberEndCareer: string | null;
  submissionCount: number;
  submissionCountPublic: number;
  submissionCountCareer: number;
}

interface RegionsResponse {
  exams: ExamItem[];
  selectedExamId: number | null;
  regions: PoliceRegionRow[];
  error?: string;
}

type EditableNumberField =
  | "recruitCount"
  | "recruitCountCareer"
  | "applicantCount"
  | "applicantCountCareer";

type EditableTextField =
  | "examNumberStart"
  | "examNumberEnd"
  | "examNumberStartCareer"
  | "examNumberEndCareer";

function numberInputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

export default function PoliceAdminRegionsPage() {
  const { showErrorToast, showToast } = useToast();
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [rows, setRows] = useState<PoliceRegionRow[]>([]);
  const [originalRows, setOriginalRows] = useState<PoliceRegionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const load = useCallback(
    async (examId?: number) => {
      setIsLoading(true);
      try {
        const query = examId ? `?examId=${examId}` : "";
        const response = await fetch(`/api/admin/regions${query}`, { cache: "no-store" });
        const payload = (await response.json()) as RegionsResponse;
        if (!response.ok) throw new Error(payload.error ?? "경찰 모집 설정을 불러오지 못했습니다.");
        setExams(payload.exams);
        setSelectedExamId(payload.selectedExamId);
        setRows(payload.regions);
        setOriginalRows(payload.regions);
      } catch (error) {
        showErrorToast(error instanceof Error ? error.message : "경찰 모집 설정을 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [showErrorToast]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const changedRows = useMemo(
    () =>
      rows.filter((row) => {
        const original = originalRows.find((item) => item.id === row.id);
        return original ? JSON.stringify(original) !== JSON.stringify(row) : true;
      }),
    [originalRows, rows]
  );

  function updateNumber(rowId: number, field: EditableNumberField, value: string) {
    const parsed = value.trim() === "" ? null : Number(value);
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null,
            }
          : row
      )
    );
  }

  function updateText(rowId: number, field: EditableTextField, value: string) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: value || null } : row))
    );
  }

  async function save() {
    if (!selectedExamId || changedRows.length === 0) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/regions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExamId, regions: changedRows }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "경찰 모집 설정 저장에 실패했습니다.");
      showToast(payload.message ?? "경찰 모집 설정을 저장했습니다.", "success");
      await load(selectedExamId);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "경찰 모집 설정 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function copyFromPrevious() {
    if (!selectedExamId) return;
    const source = exams.find((exam) => exam.id !== selectedExamId);
    if (!source) {
      showErrorToast("복사할 이전 시험이 없습니다.");
      return;
    }
    setIsCopying(true);
    try {
      const response = await fetch("/api/admin/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceExamId: source.id, targetExamId: selectedExamId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "이전 시험 설정 복사에 실패했습니다.");
      showToast("이전 시험의 경찰 모집 설정을 복사했습니다.", "success");
      await load(selectedExamId);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "이전 시험 설정 복사에 실패했습니다.");
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">경찰 지역 및 모집인원 관리</h1>
          <p className="mt-1 text-sm text-slate-600">
            전국 지역의 활성 상태와 공채·경행경채 모집인원, 출원인원, 응시번호 범위를 관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void copyFromPrevious()} disabled={isLoading || isCopying || !selectedExamId}>
            {isCopying ? "복사 중..." : "이전 시험 설정 복사"}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={isLoading || isSaving || changedRows.length === 0}>
            {isSaving ? "저장 중..." : `변경 ${changedRows.length}개 저장`}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="police-region-exam">
          시험 선택
        </label>
        <select
          id="police-region-exam"
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-police-600 sm:max-w-md"
          value={selectedExamId ?? ""}
          onChange={(event) => void load(Number(event.target.value))}
          disabled={isLoading}
        >
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}{exam.isActive ? " (활성)" : ""}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          경찰 모집 설정을 불러오는 중입니다.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-sm text-amber-800">
          등록된 경찰 지역이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            활성 지역만 학생의 지역 선택·성적 제출·합격예측에 표시됩니다. 현재 운영할 지역만 활성으로 두고 저장하세요.
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-[1280px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="w-28 whitespace-nowrap px-4 py-3">지역</th>
                  <th className="w-28 whitespace-nowrap px-4 py-3">운영 상태</th>
                  <th className="w-24 whitespace-nowrap px-4 py-3">직렬</th>
                  <th className="whitespace-nowrap px-4 py-3">모집인원</th>
                  <th className="whitespace-nowrap px-4 py-3">출원인원</th>
                  <th className="whitespace-nowrap px-4 py-3">응시번호 시작</th>
                  <th className="whitespace-nowrap px-4 py-3">응시번호 끝</th>
                  <th className="w-24 whitespace-nowrap px-4 py-3 text-right">참여</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.flatMap((row) =>
                  ([
                    {
                      key: "public",
                      label: "공채",
                      recruitField: "recruitCount" as const,
                      applicantField: "applicantCount" as const,
                      startField: "examNumberStart" as const,
                      endField: "examNumberEnd" as const,
                      participants: row.submissionCountPublic,
                    },
                    {
                      key: "career",
                      label: "경행경채",
                      recruitField: "recruitCountCareer" as const,
                      applicantField: "applicantCountCareer" as const,
                      startField: "examNumberStartCareer" as const,
                      endField: "examNumberEndCareer" as const,
                      participants: row.submissionCountCareer,
                    },
                  ]).map((cohort, index) => (
                    <tr key={`${row.id}-${cohort.key}`} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {index === 0 ? row.name : ""}
                      </td>
                      {index === 0 ? (
                        <td className="whitespace-nowrap px-4 py-3" rowSpan={2}>
                          <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={row.isActive}
                              onChange={(event) =>
                                setRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id ? { ...item, isActive: event.target.checked } : item
                                  )
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 text-police-600 focus:ring-police-500"
                              aria-label={`${row.name} 지역 활성화`}
                            />
                            {row.isActive ? "활성" : "비활성"}
                          </label>
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{cohort.label}</td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={0}
                          value={numberInputValue(row[cohort.recruitField])}
                          onChange={(event) => updateNumber(row.id, cohort.recruitField, event.target.value)}
                          aria-label={`${row.name} ${cohort.label} 모집인원`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={0}
                          value={numberInputValue(row[cohort.applicantField])}
                          onChange={(event) => updateNumber(row.id, cohort.applicantField, event.target.value)}
                          placeholder="미입력"
                          aria-label={`${row.name} ${cohort.label} 출원인원`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          inputMode="numeric"
                          maxLength={10}
                          value={row[cohort.startField] ?? ""}
                          onChange={(event) => updateText(row.id, cohort.startField, event.target.value)}
                          aria-label={`${row.name} ${cohort.label} 응시번호 시작`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          inputMode="numeric"
                          maxLength={10}
                          value={row[cohort.endField] ?? ""}
                          onChange={(event) => updateText(row.id, cohort.endField, event.target.value)}
                          aria-label={`${row.name} ${cohort.label} 응시번호 끝`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
                        {cohort.participants}명
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
