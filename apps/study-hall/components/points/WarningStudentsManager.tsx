"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clipboard, Copy, RefreshCcw, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/sonner";

import { WarningStageBadge } from "@/components/students/StudentBadges";
import type { WarningStudentItem } from "@/lib/services/point.service";

type WarningStudentsManagerProps = {
  divisionSlug: string;
  initialStudents: WarningStudentItem[];
  divisionName: string;
  warningTemplates: Record<"WARNING_1" | "WARNING_2" | "INTERVIEW" | "WITHDRAWAL", string>;
  studentManagementEnabled: boolean;
};

const stageOptions = [
  { value: "ALL", label: "전체 단계" },
  { value: "WARNING_1", label: "1차 경고" },
  { value: "WARNING_2", label: "2차 경고" },
  { value: "INTERVIEW", label: "면담 대상" },
  { value: "WITHDRAWAL", label: "퇴실 대상" },
] as const;

export function WarningStudentsManager({
  divisionSlug,
  initialStudents,
  divisionName,
  warningTemplates,
  studentManagementEnabled,
}: WarningStudentsManagerProps) {
  const [students, setStudents] = useState(initialStudents);
  const [stageFilter, setStageFilter] = useState<(typeof stageOptions)[number]["value"]>("ALL");

  useEffect(() => {
    setStudents(initialStudents);
  }, [initialStudents]);

  const filteredStudents = useMemo(
    () =>
      students.filter((student) => stageFilter === "ALL" || student.warningStage === stageFilter),
    [stageFilter, students],
  );

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("클립보드 복사에 실패했습니다.");
    }
  }

  async function refreshStudents() {
    const response = await fetch(`/api/${divisionSlug}/warnings`, {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "경고 대상자 목록을 불러오지 못했습니다.");
    }

    setStudents(data.students);
  }

  function buildWarningMessage(student: WarningStudentItem) {
    const template =
      student.warningStage === "NORMAL"
        ? warningTemplates.WARNING_1
        : warningTemplates[student.warningStage];
    return template
      .replaceAll("{학원명}", divisionName)
      .replaceAll("{직렬명}", student.studyTrack || "미지정")
      .replaceAll("{학생이름}", student.name)
      .replaceAll("{벌점}", String(student.netPoints))
      .replaceAll("{경고단계}", student.warningStageLabel);
  }

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="admin-section-title">경고 대상자 현황</h2>
            <p className="admin-help mt-2 leading-6">
              벌점 누적 기준은 직렬 설정값을 기준으로 계산됩니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await refreshStudents();
                  toast.success("경고 대상자 목록을 새로고침했습니다.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "경고 대상자 목록을 불러오지 못했습니다.");
                }
              }}
              className="admin-button"
            >
              <RefreshCcw className="h-4 w-4" />
              새로고침
            </button>

            <button
              type="button"
              onClick={() =>
                copyText(
                  filteredStudents
                    .map((student) => `${student.name}\t${student.phone || ""}`)
                    .join("\n"),
                  "연락처 전체를 복사했습니다.",
                )
              }
              className="admin-button admin-button-primary"
            >
              <Clipboard className="h-4 w-4" />
              전체 연락처 복사
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as (typeof stageOptions)[number]["value"])}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
          >
            {stageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <span className="admin-notice">
            {filteredStudents.length}명 표시
          </span>
        </div>

        {filteredStudents.length > 0 ? (
          <div className="admin-table-frame mt-5 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="text-left text-slate-500">
                  <th>단계</th>
                  <th>이름</th>
                  <th>수험번호</th>
                  <th>벌점</th>
                  <th>전화번호</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <WarningStageBadge stage={student.warningStage} label={student.warningStageLabel} />
                    </td>
                    <td>{student.name}</td>
                    <td>{student.studentNumber}</td>
                    <td>{student.netPoints}점</td>
                    <td>{student.phone || "미등록"}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => copyText(student.phone || "", `${student.name} 연락처를 복사했습니다.`)}
                          className="admin-button admin-button-compact"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          복사
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(buildWarningMessage(student), `${student.name} 문자 초안을 복사했습니다.`)
                          }
                          className="admin-button admin-button-compact"
                        >
                          <Clipboard className="h-3.5 w-3.5" />
                          문자 초안 복사
                        </button>
                        {studentManagementEnabled ? (
                          <Link
                          href={`/${divisionSlug}/admin/students/${student.id}`}
                          className="admin-button admin-button-primary"
                        >
                          학생 보기
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-help mt-5 px-5 py-8 text-center">
            <TriangleAlert className="mx-auto h-5 w-5 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-700">조건에 맞는 경고 대상자가 없습니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}
