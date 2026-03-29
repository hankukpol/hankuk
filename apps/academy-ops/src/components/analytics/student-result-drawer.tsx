"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AttendType, StudentType } from "@prisma/client";
import { StudentResultProfile } from "@/lib/analytics/service";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  formatScore,
} from "@/lib/analytics/presentation";
import { ATTEND_TYPE_LABEL, STUDENT_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type StudentResultDrawerProps = {
  profile: StudentResultProfile;
  onClose: () => void;
};

function countLabel(value: number, label: string) {
  return `${value.toLocaleString("ko-KR")}회 ${label}`;
}

function attendBadgeClass(attendType: AttendType | null) {
  switch (attendType) {
    case AttendType.NORMAL:
      return "border-forest/20 bg-forest/10 text-forest";
    case AttendType.LIVE:
      return "border-blue-200 bg-blue-50 text-blue-700";
    case AttendType.EXCUSED:
      return "border-amber-200 bg-amber-50 text-amber-700";
    case AttendType.ABSENT:
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-ink/10 bg-white text-slate";
  }
}

export function StudentResultDrawer({
  profile,
  onClose,
}: StudentResultDrawerProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] [animation:analytics-drawer-overlay-in_180ms_ease-out]"
        onClick={onClose}
      />

      <aside
        aria-modal="true"
        role="dialog"
        aria-label={`${profile.name} 성적 요약`}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl [animation:analytics-drawer-in_220ms_ease-out]"
      >
        <div className="flex items-start justify-between border-b border-ink/10 px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">
                {profile.name} ({profile.examNumber})
              </h2>
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[profile.currentStatus]}`}
              >
                {STATUS_LABEL[profile.currentStatus]}
              </span>
              <span className="inline-flex rounded-full border border-ink/10 px-2.5 py-0.5 text-xs font-semibold text-slate">
                {STUDENT_TYPE_LABEL[profile.studentType as StudentType]}
              </span>
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  profile.isActive
                    ? "border-forest/20 bg-forest/10 text-forest"
                    : "border-slate-200 bg-slate-100 text-slate"
                }`}
              >
                {profile.isActive ? "재원" : "비활성"}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate">
              관리자용 학생 성적 요약입니다.
              {profile.phone ? ` 연락처 ${profile.phone}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                prefetch={false}
                href={`/admin/students/${profile.examNumber}/analysis`}
                className="inline-flex items-center rounded-full border border-ink/10 px-3 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                개인 분석
              </Link>
              <Link
                prefetch={false}
                href={`/admin/students/${profile.examNumber}/scores`}
                className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-3 py-2 text-sm font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/10"
              >
                성적 이력
              </Link>
              <Link
                prefetch={false}
                href={`/admin/students/${profile.examNumber}/score-trend`}
                className="inline-flex items-center rounded-full border border-ink/10 px-3 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                성적 추이
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate transition hover:bg-ink/10 hover:text-ink"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="text-base font-semibold">핵심 요약</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="border border-ink/10 bg-mist px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">집계 평균</p>
                <p className="mt-2 text-2xl font-semibold">{formatScore(profile.summary.rankingAverage)}</p>
              </div>
              <div className="border border-ink/10 bg-mist px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">참여율</p>
                <p className="mt-2 text-2xl font-semibold">{profile.summary.participationRate.toFixed(1)}%</p>
              </div>
              <div className="border border-ink/10 bg-mist px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">최고 점수</p>
                <p className="mt-2 text-2xl font-semibold">{formatScore(profile.summary.bestScore)}</p>
              </div>
              <div className="border border-ink/10 bg-mist px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">진행 회차</p>
                <p className="mt-2 text-2xl font-semibold">{profile.summary.sessionCount.toLocaleString("ko-KR")}</p>
              </div>
              <div className="border border-ink/10 bg-mist px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">사유결시 / 무단결시</p>
                <p className="mt-2 text-2xl font-semibold">
                  {profile.summary.excusedCount} / {profile.summary.absentCount}
                </p>
              </div>
              <div className="border border-ink/10 bg-mist px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">최근 시험일</p>
                <p className="mt-2 text-2xl font-semibold">
                  {profile.summary.latestExamDate ? formatDate(profile.summary.latestExamDate) : "-"}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate">
              <span className="border border-ink/10 px-3 py-2">
                {countLabel(profile.summary.scoredCount, "점수 기록")}
              </span>
              <span className="border border-ink/10 px-3 py-2">
                {countLabel(profile.summary.normalCount, "현장")}
              </span>
              <span className="border border-ink/10 px-3 py-2">
                {countLabel(profile.summary.liveCount, "LIVE")}
              </span>
              <span className="border border-ink/10 px-3 py-2">
                {profile.summary.perfectAttendance ? "개근 유지" : "개근 아님"}
              </span>
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">과목별 요약</h3>
              <p className="text-xs text-slate">과목별 점수와 결시 현황을 한 번에 확인할 수 있습니다.</p>
            </div>
            <div className="mt-4 overflow-x-auto border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">과목</th>
                    <th className="px-4 py-3 font-semibold">평균</th>
                    <th className="px-4 py-3 font-semibold">최고</th>
                    <th className="px-4 py-3 font-semibold">최저</th>
                    <th className="px-4 py-3 font-semibold">점수기록</th>
                    <th className="px-4 py-3 font-semibold">LIVE</th>
                    <th className="px-4 py-3 font-semibold">사유결시</th>
                    <th className="px-4 py-3 font-semibold">무단결시</th>
                    <th className="px-4 py-3 font-semibold">최근 점수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {profile.subjects.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate">
                        표시할 과목 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                  {profile.subjects.map((subject) => (
                    <tr key={subject.subject}>
                      <td className="px-4 py-3">{SUBJECT_LABEL[subject.subject]}</td>
                      <td className="px-4 py-3">{formatScore(subject.average)}</td>
                      <td className="px-4 py-3">{formatScore(subject.highest)}</td>
                      <td className="px-4 py-3">{formatScore(subject.lowest)}</td>
                      <td className="px-4 py-3">{subject.scoredCount}</td>
                      <td className="px-4 py-3">{subject.liveCount}</td>
                      <td className="px-4 py-3">{subject.excusedCount}</td>
                      <td className="px-4 py-3">{subject.absentCount}</td>
                      <td className="px-4 py-3">
                        {formatScore(subject.latestScore)}
                        {subject.latestExamDate ? (
                          <span className="ml-2 text-xs text-slate">
                            ({formatDate(subject.latestExamDate)})
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">최근 시험 기록</h3>
              <p className="text-xs text-slate">최근 회차 순으로 최대 8건을 표시합니다.</p>
            </div>
            <div className="mt-4 overflow-x-auto border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">시험일</th>
                    <th className="px-4 py-3 font-semibold">주차</th>
                    <th className="px-4 py-3 font-semibold">과목</th>
                    <th className="px-4 py-3 font-semibold">상태</th>
                    <th className="px-4 py-3 font-semibold">점수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {profile.recentEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate">
                        최근 기록이 없습니다.
                      </td>
                    </tr>
                  ) : null}
                  {profile.recentEntries.map((entry) => (
                    <tr key={entry.sessionId}>
                      <td className="px-4 py-3">{formatDate(entry.examDate)}</td>
                      <td className="px-4 py-3">{entry.week}주차</td>
                      <td className="px-4 py-3">{SUBJECT_LABEL[entry.subject]}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${attendBadgeClass(entry.attendType)}`}
                        >
                          {entry.attendType ? ATTEND_TYPE_LABEL[entry.attendType] : "미기록"}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatScore(entry.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
