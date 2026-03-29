"use client";

import { LoaderCircle, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  PortalEmptyState,
  PortalSectionHeader,
  portalInsetClass,
  portalSectionClass,
} from "@/components/student-view/StudentPortalUi";
import type { ExamTypeItem } from "@/lib/services/exam.service";
import type { ScoreTargetItem } from "@/lib/services/score-target.service";

type ScoreTargetPanelProps = {
  divisionSlug: string;
  studentId: string;
  initialTargets: ScoreTargetItem[];
  availableExamTypes?: Array<Pick<ExamTypeItem, "id" | "name" | "studyTrack">>;
  canEdit?: boolean;
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("ko-KR");
}

function getStatusTone(target: ScoreTargetItem) {
  if (target.isAchieved) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (target.latestScore === null) {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function ScoreTargetPanel({
  divisionSlug,
  studentId,
  initialTargets,
  availableExamTypes = [],
  canEdit = false,
}: ScoreTargetPanelProps) {
  const [targets, setTargets] = useState(initialTargets);
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(
    initialTargets[0]?.examTypeId ?? availableExamTypes[0]?.id ?? "",
  );
  const [targetScore, setTargetScore] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingTargetId, setDeletingTargetId] = useState<string | null>(null);

  const selectedExistingTarget = useMemo(
    () => targets.find((target) => target.examTypeId === selectedExamTypeId) ?? null,
    [selectedExamTypeId, targets],
  );

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    if (!selectedExamTypeId && availableExamTypes[0]?.id) {
      setSelectedExamTypeId(availableExamTypes[0].id);
      return;
    }

    if (selectedExistingTarget) {
      setTargetScore(String(selectedExistingTarget.targetScore));
      setNote(selectedExistingTarget.note ?? "");
      return;
    }

    setTargetScore("");
    setNote("");
  }, [availableExamTypes, canEdit, selectedExamTypeId, selectedExistingTarget]);

  async function handleSave() {
    if (!selectedExamTypeId) {
      toast.error("시험 종류를 먼저 선택해 주세요.");
      return;
    }

    const parsedScore = Number(targetScore);
    if (!Number.isInteger(parsedScore) || parsedScore < 0) {
      toast.error("목표 점수는 0 이상의 정수만 입력할 수 있습니다.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/students/${studentId}/score-targets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          examTypeId: selectedExamTypeId,
          targetScore: parsedScore,
          note: note.trim() || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "성적 목표 저장에 실패했습니다.");
      }

      setTargets(data.targets ?? []);
      toast.success("성적 목표를 저장했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성적 목표 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(targetId: string) {
    setDeletingTargetId(targetId);

    try {
      const response = await fetch(
        `/api/${divisionSlug}/students/${studentId}/score-targets/${targetId}`,
        {
          method: "DELETE",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "성적 목표 삭제에 실패했습니다.");
      }

      setTargets(data.targets ?? []);
      toast.success("성적 목표를 삭제했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성적 목표 삭제에 실패했습니다.");
    } finally {
      setDeletingTargetId(null);
    }
  }

  return (
    <section className={portalSectionClass}>
      <PortalSectionHeader
        title="성적 목표"
        description="시험 종류별로 목표 점수를 확인하고, 관리자 권한이 있을 때만 수정할 수 있습니다."
        icon={<Target className="h-5 w-5" />}
      />

      {canEdit ? (
        <div className={`mt-5 ${portalInsetClass}`}>
          <div className="grid gap-3 md:grid-cols-[1.3fr_0.8fr]">
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-[var(--foreground)]">시험 종류</span>
              <select
                value={selectedExamTypeId}
                onChange={(event) => setSelectedExamTypeId(event.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--division-color)]"
              >
                {availableExamTypes.length > 0 ? (
                  availableExamTypes.map((examType) => (
                    <option key={examType.id} value={examType.id}>
                      {examType.name}
                      {examType.studyTrack ? ` · ${examType.studyTrack}` : ""}
                    </option>
                  ))
                ) : (
                  <option value="">설정 가능한 시험이 없습니다.</option>
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-[var(--foreground)]">목표 점수</span>
              <input
                type="number"
                min={0}
                step={1}
                value={targetScore}
                onChange={(event) => setTargetScore(event.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--division-color)]"
                placeholder="예: 420"
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="mb-2 block text-[13px] font-semibold text-[var(--foreground)]">메모</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[96px] w-full rounded-[10px] border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--division-color)]"
              placeholder="예: 4월까지 주간 모의고사 420점 이상 유지"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-[var(--muted)]">
              같은 시험 종류를 다시 저장하면 기존 목표가 최신 값으로 갱신됩니다.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || availableExamTypes.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              style={{
                backgroundColor: "var(--division-color)",
                color: "var(--division-on-accent)",
              }}
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Target className="h-4 w-4" />
              )}
              목표 저장
            </button>
          </div>
        </div>
      ) : null}

      {targets.length > 0 ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {targets.map((target) => (
            <article key={target.id} className={portalInsetClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium text-[var(--muted)]">
                    {target.studyTrack || "공통"}
                  </p>
                  <h4 className="mt-1.5 text-[17px] font-bold text-[var(--foreground)]">
                    {target.examTypeName}
                  </h4>
                </div>

                <span
                  className={`rounded-[10px] border px-3 py-1.5 text-[12px] font-medium ${getStatusTone(target)}`}
                >
                  {target.isAchieved
                    ? "달성"
                    : target.latestScore === null
                      ? "미응시"
                      : `${target.gapToTarget ?? 0}점 차이`}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-3">
                  <p className="text-[12px] font-medium text-[var(--muted)]">
                    목표 점수
                  </p>
                  <p className="mt-1.5 text-[20px] font-bold tracking-tight text-[var(--foreground)]">
                    {target.targetScore}
                  </p>
                </div>
                <div className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-3">
                  <p className="text-[12px] font-medium text-[var(--muted)]">
                    최신 점수
                  </p>
                  <p className="mt-1.5 text-[20px] font-bold tracking-tight text-[var(--foreground)]">
                    {target.latestScore ?? "-"}
                  </p>
                </div>
                <div className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-3">
                  <p className="text-[12px] font-medium text-[var(--muted)]">
                    최신 회차
                  </p>
                  <p className="mt-1.5 text-[20px] font-bold tracking-tight text-[var(--foreground)]">
                    {target.latestExamRound ? `${target.latestExamRound}회차` : "-"}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-[13px] text-[var(--muted)]">
                최근 시험일 {formatDate(target.latestExamDate)}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {target.note || "등록된 목표 메모가 없습니다."}
              </p>

              {canEdit ? (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleDelete(target.id)}
                    disabled={deletingTargetId === target.id}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
                  >
                    {deletingTargetId === target.id ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    목표 삭제
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <PortalEmptyState
            title="등록된 성적 목표가 없습니다."
            description="시험별 목표 점수가 설정되면 최신 시험 결과와 함께 이 영역에 표시됩니다."
          />
        </div>
      )}
    </section>
  );
}
