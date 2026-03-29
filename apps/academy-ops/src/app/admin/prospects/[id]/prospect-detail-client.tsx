"use client";

import { ExamType, ProspectSource, ProspectStage } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toDateInputValue } from "@/lib/format";

export type ProspectDetail = {
  id: string;
  name: string;
  phone: string | null;
  examType: string | null;
  source: string;
  stage: string;
  note: string | null;
  staffId: string;
  enrollmentId: string | null;
  visitedAt: string;
  createdAt: string;
  updatedAt: string;
  staff: { name: string } | null;
  enrollment: {
    id: string;
    student: {
      examNumber: string;
      name: string;
    } | null;
    cohort: { name: string } | null;
  } | null;
};

const SOURCE_LABELS: Record<ProspectSource, string> = {
  WALK_IN: "내방",
  PHONE: "전화",
  SNS: "SNS",
  REFERRAL: "추천",
  OTHER: "기타",
};

const STAGE_LABELS: Record<ProspectStage, string> = {
  INQUIRY: "문의",
  VISITING: "내방상담",
  DECIDING: "검토중",
  REGISTERED: "등록완료",
  DROPPED: "이탈",
};

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const STAGE_BADGE_CLASS: Record<ProspectStage, string> = {
  INQUIRY: "bg-slate-100 text-slate-600 border-slate-200",
  VISITING: "bg-blue-50 text-blue-700 border-blue-200",
  DECIDING: "bg-amber-50 text-amber-700 border-amber-200",
  REGISTERED: "bg-forest/10 text-forest border-forest/20",
  DROPPED: "bg-red-50 text-red-700 border-red-200",
};

// Next stage to advance to
const NEXT_STAGE: Partial<Record<ProspectStage, ProspectStage>> = {
  INQUIRY: ProspectStage.VISITING,
  VISITING: ProspectStage.DECIDING,
  DECIDING: ProspectStage.REGISTERED,
};

const NEXT_STAGE_LABEL: Partial<Record<ProspectStage, string>> = {
  INQUIRY: "내방상담",
  VISITING: "검토중",
  DECIDING: "등록완료",
};

const ALL_STAGES: ProspectStage[] = [
  ProspectStage.INQUIRY,
  ProspectStage.VISITING,
  ProspectStage.DECIDING,
  ProspectStage.REGISTERED,
  ProspectStage.DROPPED,
];

type EditForm = {
  name: string;
  phone: string;
  examType: ExamType | "";
  source: ProspectSource;
  note: string;
  visitedAt: string;
};

function Spinner() {
  return (
    <svg
      className="mr-1.5 inline-block h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string | undefined) ?? "요청 실패");
  return data as T;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  initialProspect: ProspectDetail;
}

export function ProspectDetailClient({ initialProspect }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [prospect, setProspect] = useState<ProspectDetail>(initialProspect);
  const [isEditing, setIsEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStageSelect, setShowStageSelect] = useState(false);

  const [editForm, setEditForm] = useState<EditForm>({
    name: prospect.name,
    phone: prospect.phone ?? "",
    examType: (prospect.examType as ExamType | null) ?? "",
    source: prospect.source as ProspectSource,
    note: prospect.note ?? "",
    visitedAt: toDateInputValue(prospect.visitedAt) ?? "",
  });

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  function openEdit() {
    setEditForm({
      name: prospect.name,
      phone: prospect.phone ?? "",
      examType: (prospect.examType as ExamType | null) ?? "",
      source: prospect.source as ProspectSource,
      note: prospect.note ?? "",
      visitedAt: toDateInputValue(prospect.visitedAt) ?? "",
    });
    setNotice(null);
    setErrorMessage(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setErrorMessage(null);
  }

  function handleSave() {
    if (!editForm.name.trim()) {
      setErrorMessage("이름을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await requestJson<{ data: { prospect: ProspectDetail } }>(
          `/api/prospects/${prospect.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: editForm.name.trim(),
              phone: editForm.phone.trim() || null,
              examType: editForm.examType || null,
              source: editForm.source,
              note: editForm.note.trim() || null,
              visitedAt: editForm.visitedAt,
            }),
          },
        );
        // Preserve enrollment data from current state
        setProspect((prev) => ({ ...prev, ...result.data.prospect }));
        setIsEditing(false);
        setNotice("정보를 수정했습니다.");
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "수정 실패");
      }
    });
  }

  function handleStageChange(newStage: ProspectStage) {
    startTransition(async () => {
      try {
        const result = await requestJson<{ data: { prospect: ProspectDetail } }>(
          `/api/prospects/${prospect.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ stage: newStage }),
          },
        );
        setProspect((prev) => ({ ...prev, ...result.data.prospect }));
        setShowStageSelect(false);
        setNotice(`단계를 "${STAGE_LABELS[newStage]}"으로 변경했습니다.`);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "단계 변경 실패");
        setShowStageSelect(false);
      }
    });
  }

  function handleQuickAdvance() {
    const nextStage = NEXT_STAGE[prospect.stage as ProspectStage];
    if (!nextStage) return;
    handleStageChange(nextStage);
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await requestJson<{ data: { ok: true } }>(
          `/api/prospects/${prospect.id}`,
          { method: "DELETE" },
        );
        router.push("/admin/prospects");
        router.refresh();
      } catch (error) {
        setShowDeleteConfirm(false);
        setErrorMessage(error instanceof Error ? error.message : "삭제 실패");
      }
    });
  }

  const currentStage = prospect.stage as ProspectStage;
  const nextStage = NEXT_STAGE[currentStage];
  const nextLabel = NEXT_STAGE_LABEL[currentStage];

  return (
    <div className="space-y-6">
      {/* Notices */}
      {notice ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* Stage Progression */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">상담 단계</h2>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${
                  STAGE_BADGE_CLASS[currentStage]
                }`}
              >
                {STAGE_LABELS[currentStage]}
              </span>
              {nextStage && nextLabel ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleQuickAdvance}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    nextStage === ProspectStage.REGISTERED
                      ? "border-forest/30 bg-forest/10 text-forest hover:bg-forest/20"
                      : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  {isPending ? <Spinner /> : null}
                  → {nextLabel}
                </button>
              ) : null}
            </div>
          </div>

          {/* Stage selector */}
          <div className="relative">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowStageSelect((v) => !v)}
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              단계 변경
              <svg
                className="ml-1.5 h-3.5 w-3.5 text-slate"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {showStageSelect ? (
              <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-2xl border border-ink/10 bg-white shadow-lg">
                {ALL_STAGES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={isPending || s === currentStage}
                    onClick={() => handleStageChange(s)}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-mist/60 disabled:cursor-not-allowed disabled:opacity-40 ${
                      s === currentStage ? "font-semibold text-ink" : "text-slate"
                    }`}
                  >
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STAGE_BADGE_CLASS[s]}`}
                    >
                      {STAGE_LABELS[s]}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Stage timeline */}
        <div className="mt-5">
          <div className="flex items-center gap-0">
            {(["INQUIRY", "VISITING", "DECIDING", "REGISTERED"] as ProspectStage[]).map(
              (s, i) => {
                const isCompleted =
                  ALL_STAGES.indexOf(currentStage) > ALL_STAGES.indexOf(s);
                const isCurrent = s === currentStage;
                const isDropped = currentStage === ProspectStage.DROPPED;
                return (
                  <div key={s} className="flex flex-1 items-center">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                        isDropped
                          ? "bg-red-100 text-red-400"
                          : isCurrent
                            ? "bg-ember text-white"
                            : isCompleted
                              ? "bg-forest text-white"
                              : "border border-ink/20 bg-mist text-slate"
                      }`}
                    >
                      {isCompleted && !isDropped ? (
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <div className="flex-1 text-center">
                      <span
                        className={`text-xs font-medium ${
                          isCurrent ? "text-ember" : isCompleted ? "text-forest" : "text-slate"
                        }`}
                      >
                        {STAGE_LABELS[s]}
                      </span>
                    </div>
                    {i < 3 ? (
                      <div
                        className={`h-px w-4 shrink-0 ${
                          isDropped
                            ? "bg-red-200"
                            : isCompleted || isCurrent
                              ? "bg-forest/40"
                              : "bg-ink/10"
                        }`}
                      />
                    ) : null}
                  </div>
                );
              },
            )}
          </div>
          {currentStage === ProspectStage.DROPPED ? (
            <p className="mt-3 text-xs text-red-600">이탈 처리된 상담 방문자입니다.</p>
          ) : null}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? <Spinner /> : null}
                저장
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              수정
            </button>
          )}
        </div>

        {!isEditing ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            기록 삭제
          </button>
        ) : null}
      </div>

      {/* Delete Confirm */}
      {showDeleteConfirm ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-800">이 상담 방문자 기록을 삭제하시겠습니까?</p>
          <p className="mt-1 text-sm text-red-700">
            삭제 후에는 복구할 수 없습니다. 수납 및 수강 데이터와 연결된 경우 삭제가 제한될 수
            있습니다.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="inline-flex items-center rounded-full bg-red-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <Spinner /> : null}
              삭제 확인
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {/* Detail / Edit Card */}
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold">상담 방문자 정보</h2>
          {isEditing ? (
            <p className="mt-0.5 text-xs text-slate">필드를 수정 후 저장 버튼을 누르세요.</p>
          ) : null}
        </div>

        {isEditing ? (
          <div className="space-y-4 p-6">
            {errorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {/* 이름 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="예: 홍길동"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
              />
            </div>

            {/* 연락처 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                연락처
                <span className="ml-1 text-xs font-normal text-slate">(선택)</span>
              </label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="예: 010-1234-5678"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
              />
            </div>

            {/* 시험유형 + 유입경로 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">관심 시험</label>
                <select
                  value={editForm.examType}
                  onChange={(e) => setField("examType", e.target.value as ExamType | "")}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
                >
                  <option value="">선택 안 함</option>
                  {(Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((t) => (
                    <option key={t} value={t}>
                      {EXAM_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  방문경로 <span className="text-red-500">*</span>
                </label>
                <select
                  value={editForm.source}
                  onChange={(e) => setField("source", e.target.value as ProspectSource)}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
                >
                  {(Object.keys(SOURCE_LABELS) as ProspectSource[]).map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 방문일 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">방문일</label>
              <input
                type="date"
                value={editForm.visitedAt}
                onChange={(e) => setField("visitedAt", e.target.value)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
              />
            </div>

            {/* 메모 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                메모
                <span className="ml-1 text-xs font-normal text-slate">(선택)</span>
              </label>
              <textarea
                value={editForm.note}
                onChange={(e) => setField("note", e.target.value)}
                placeholder="상담 내용, 특이사항 등 자유롭게 입력하세요"
                rows={4}
                className="w-full resize-none rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
              />
            </div>
          </div>
        ) : (
          <dl className="divide-y divide-ink/10">
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">이름</dt>
              <dd className="text-sm font-semibold text-ink">{prospect.name}</dd>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">연락처</dt>
              <dd className="text-sm text-ink">
                {prospect.phone ? (
                  <a
                    href={`tel:${prospect.phone}`}
                    className="text-ember hover:underline"
                  >
                    {prospect.phone}
                  </a>
                ) : (
                  <span className="text-slate">-</span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">관심 시험</dt>
              <dd className="text-sm text-ink">
                {prospect.examType
                  ? EXAM_TYPE_LABELS[prospect.examType as ExamType]
                  : <span className="text-slate">-</span>}
              </dd>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">방문경로</dt>
              <dd className="text-sm text-ink">
                {SOURCE_LABELS[prospect.source as ProspectSource]}
              </dd>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">방문일</dt>
              <dd className="text-sm text-ink">{formatDate(prospect.visitedAt)}</dd>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">메모</dt>
              <dd className="whitespace-pre-wrap text-sm leading-7 text-ink">
                {prospect.note ? (
                  prospect.note
                ) : (
                  <span className="text-slate">-</span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">담당 직원</dt>
              <dd className="text-sm text-ink">{prospect.staff?.name ?? "-"}</dd>
            </div>
          </dl>
        )}
      </div>

      {/* Enrollment conversion info */}
      {prospect.stage === ProspectStage.REGISTERED ? (
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
          <h2 className="text-base font-semibold text-forest">전환 정보</h2>
          {prospect.enrollment ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-ink">
                이 방문자는 수강 등록이 완료된 원생입니다.
              </p>
              <dl className="divide-y divide-forest/10">
                {prospect.enrollment.student ? (
                  <div className="grid grid-cols-[160px_1fr] gap-4 py-3">
                    <dt className="self-start pt-0.5 text-sm font-medium text-slate">학생 정보</dt>
                    <dd className="text-sm">
                      <Link
                        href={`/admin/students/${prospect.enrollment.student.examNumber}`}
                        className="font-semibold text-ember hover:underline"
                      >
                        {prospect.enrollment.student.name}
                        <span className="ml-1.5 font-normal text-slate">
                          ({prospect.enrollment.student.examNumber})
                        </span>
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {prospect.enrollment.cohort ? (
                  <div className="grid grid-cols-[160px_1fr] gap-4 py-3">
                    <dt className="self-start pt-0.5 text-sm font-medium text-slate">등록 반</dt>
                    <dd className="text-sm text-ink">{prospect.enrollment.cohort.name}</dd>
                  </div>
                ) : null}
                <div className="grid grid-cols-[160px_1fr] gap-4 py-3">
                  <dt className="self-start pt-0.5 text-sm font-medium text-slate">수강 바로가기</dt>
                  <dd className="text-sm">
                    <Link
                      href={`/admin/enrollments/${prospect.enrollment.id}`}
                      className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20"
                    >
                      수강 상세 보기 →
                    </Link>
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-slate">
                등록완료 단계이지만 아직 수강 등록이 연결되지 않았습니다.
              </p>
              <Link
                href="/admin/enrollments/new"
                className="mt-3 inline-flex items-center rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
              >
                수강 등록하기 →
              </Link>
            </div>
          )}
        </div>
      ) : (
        /* If not yet registered, show CTA to enroll if deciding */
        prospect.stage === ProspectStage.DECIDING ? (
          <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-base font-semibold text-amber-800">등록 전환 대기 중</h2>
            <p className="mt-2 text-sm text-amber-700">
              검토 단계의 방문자입니다. 수강 등록을 진행하려면 아래 버튼을 이용하세요.
            </p>
            <Link
              href="/admin/enrollments/new"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              수강 등록 바로가기 →
            </Link>
          </div>
        ) : null
      )}
    </div>
  );
}

