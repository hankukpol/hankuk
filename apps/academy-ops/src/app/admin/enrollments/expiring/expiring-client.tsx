"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export type ExpiringEnrollment = {
  id: string;
  endDate: string | null;
  status: string;
  courseType: string;
  student: {
    name: string;
    examNumber: string;
    phone: string | null;
  };
  cohort: {
    name: string;
    examCategory: string;
  } | null;
  product: {
    name: string;
  } | null;
  specialLecture: {
    name: string;
  } | null;
};

export type ExpiringCounts = {
  within7days: number;
  within14days: number;
  within30days: number;
  within60days: number;
};

function getDDayBadge(endDateStr: string | null): { label: string; className: string } {
  if (!endDateStr) {
    return {
      label: "만료일 없음",
      className:
        "rounded-full px-2 py-0.5 text-xs font-semibold bg-ink/5 text-slate border border-ink/10",
    };
  }
  const endDate = new Date(endDateStr);
  const now = new Date();
  const diff = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) {
    return {
      label: "D+0",
      className:
        "rounded-full px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200",
    };
  }
  if (diff <= 7) {
    return {
      label: `D-${diff}`,
      className:
        "rounded-full px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200",
    };
  }
  if (diff <= 14) {
    return {
      label: `D-${diff}`,
      className:
        "rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200",
    };
  }
  return {
    label: `D-${diff}`,
    className:
      "rounded-full px-2 py-0.5 text-xs font-semibold bg-ink/5 text-slate border border-ink/10",
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d
    .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, "-")
    .replace(/\.$/, "");
}

function getCourseName(enrollment: ExpiringEnrollment): string {
  if (enrollment.specialLecture) return enrollment.specialLecture.name;
  if (enrollment.product) return enrollment.product.name;
  if (enrollment.cohort) return enrollment.cohort.name;
  return "-";
}

function getCohortLabel(enrollment: ExpiringEnrollment): string | null {
  if (enrollment.cohort) return enrollment.cohort.name;
  return null;
}

type Props = {
  initialEnrollments: ExpiringEnrollment[];
  initialCounts: ExpiringCounts;
  initialDays: number;
};

export function ExpiringClient({ initialEnrollments, initialCounts, initialDays }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawDays = parseInt(searchParams.get("days") ?? String(initialDays), 10);
  const days = [7, 14, 30, 60].includes(rawDays) ? rawDays : initialDays;

  // Use initial server data (no client-side re-fetch; navigation reloads the server component)
  const enrollments = initialEnrollments;
  const counts = initialCounts;

  const kpiCards = [
    {
      label: "7일 이내 만료",
      count: counts.within7days,
      color: "text-red-700",
      bgColor: "bg-red-50",
      borderColor: "border-red-100",
      dotColor: "bg-red-500",
      days: 7,
    },
    {
      label: "14일 이내 만료",
      count: counts.within14days,
      color: "text-amber-700",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-100",
      dotColor: "bg-amber-500",
      days: 14,
    },
    {
      label: "30일 이내 만료",
      count: counts.within30days,
      color: "text-slate",
      bgColor: "bg-mist",
      borderColor: "border-ink/10",
      dotColor: "bg-slate",
      days: 30,
    },
    {
      label: "60일 이내 만료",
      count: counts.within60days,
      color: "text-slate",
      bgColor: "bg-mist",
      borderColor: "border-ink/10",
      dotColor: "bg-ink/30",
      days: 60,
    },
  ];

  const dayOptions = [
    { value: 7, label: "7일 이내" },
    { value: 14, label: "14일 이내" },
    { value: 30, label: "30일 이내" },
    { value: 60, label: "60일 이내" },
  ];

  function handleDaysChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/admin/enrollments/expiring?days=${e.target.value}`);
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">수강 만료 임박 현황</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            곧 수강 기간이 만료되는 학생 목록입니다. 재등록 안내 및 상담을 진행하세요.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/admin/enrollments"
            className="rounded-xl border border-ink/20 bg-white px-4 py-2.5 text-sm font-semibold text-slate hover:border-ink/40 hover:text-ink transition-colors"
          >
            수강 목록
          </Link>
          <Link
            href="/admin/enrollments/new"
            className="rounded-xl border border-forest/30 bg-forest/10 px-4 py-2.5 text-sm font-semibold text-forest hover:bg-forest/20 transition-colors"
          >
            신규 등록
          </Link>
        </div>
      </div>

      {/* Summary bar */}
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-3.5">
        <p className="text-sm font-medium text-amber-800">
          만료 임박 총{" "}
          <span className="font-bold text-amber-900">
            {days === 7
              ? counts.within7days
              : days === 14
              ? counts.within14days
              : days === 30
              ? counts.within30days
              : counts.within60days}명
          </span>{" "}
          <span className="text-amber-700 text-xs ml-2">
            (7일 이내: {counts.within7days}명 · 14일 이내: {counts.within14days}명 · 30일 이내:{" "}
            {counts.within30days}명)
          </span>
        </p>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpiCards.map((card) => (
          <Link
            key={card.label}
            href={`/admin/enrollments/expiring?days=${card.days}`}
            className={`rounded-2xl border ${card.borderColor} ${card.bgColor} p-5 transition hover:shadow-sm ${
              days === card.days ? "ring-2 ring-offset-1 ring-forest/30" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${card.dotColor}`} />
              <span className="text-xs font-medium text-slate">{card.label}</span>
            </div>
            <p className={`mt-3 text-3xl font-bold ${card.color}`}>
              {card.count.toLocaleString()}
              <span className="ml-1 text-sm font-medium">명</span>
            </p>
          </Link>
        ))}
      </div>

      {/* Filter */}
      <div className="mt-8 flex items-center gap-3">
        <label htmlFor="days-select" className="text-sm font-medium text-slate">
          조회 기간
        </label>
        <select
          id="days-select"
          value={days}
          onChange={handleDaysChange}
          className="rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest/30"
        >
          {dayOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate">
          현재 표시:{" "}
          <span className="font-semibold text-ink">
            {enrollments.length}건
          </span>
        </span>
      </div>

      {/* Table */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white overflow-hidden shadow-sm">
        {enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate">
            <svg
              className="mb-4 h-12 w-12 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm font-medium">{days}일 이내 만료 예정 수강 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    연락처
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    강좌 / 기수
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    만료일
                  </th>
                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    D-DAY
                  </th>
                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    상태
                  </th>
                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment, idx) => {
                  const dday = getDDayBadge(enrollment.endDate);
                  const courseName = getCourseName(enrollment);
                  const cohortLabel = getCohortLabel(enrollment);
                  const isAlt = idx % 2 === 1;
                  return (
                    <tr
                      key={enrollment.id}
                      className={`border-b border-ink/5 transition-colors hover:bg-forest/5 ${
                        isAlt ? "bg-mist/50" : "bg-white"
                      }`}
                    >
                      <td className="px-5 py-4 font-mono text-xs text-slate">
                        <Link
                          href={`/admin/students/${enrollment.student.examNumber}`}
                          className="hover:text-ember hover:underline"
                        >
                          {enrollment.student.examNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/students/${enrollment.student.examNumber}`}
                          className="font-semibold text-ink hover:text-ember hover:underline"
                        >
                          {enrollment.student.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate">
                        {enrollment.student.phone ?? "-"}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/enrollments/${enrollment.id}`}
                          className="text-ink hover:text-ember hover:underline"
                        >
                          <span className="font-medium">{courseName}</span>
                          {cohortLabel && (
                            <span className="ml-1.5 text-xs text-slate">({cohortLabel})</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate">
                        {formatDate(enrollment.endDate)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={dday.className}>{dday.label}</span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                          수강 중
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {/* 문자/알림 버튼 */}
                          <Link
                            href={`/admin/notifications/send?examNumber=${enrollment.student.examNumber}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-ember/30 bg-ember/10 px-2.5 py-1.5 text-xs font-semibold text-ember hover:bg-ember/20 transition-colors"
                            title="알림 발송"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                              />
                            </svg>
                            문자
                          </Link>
                          {/* 상담기록 버튼 */}
                          <Link
                            href={`/admin/students/${enrollment.student.examNumber}?tab=counseling`}
                            className="inline-flex items-center gap-1 rounded-lg border border-forest/30 bg-forest/10 px-2.5 py-1.5 text-xs font-semibold text-forest hover:bg-forest/20 transition-colors"
                            title="상담 기록 보기"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                              />
                            </svg>
                            상담기록
                          </Link>
                          {/* 갱신 등록 링크 */}
                          <Link
                            href={`/admin/enrollments/new?examNumber=${enrollment.student.examNumber}&renew=${enrollment.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-ink/20 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate hover:border-ink/40 hover:text-ink transition-colors"
                            title="갱신 등록"
                          >
                            갱신
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {enrollments.length > 0 && (
          <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate bg-mist/30">
            총{" "}
            <span className="font-semibold text-ink">{enrollments.length}</span>건 표시 중
            &nbsp;·&nbsp; {days}일 이내 만료 예정 · 만료일 오름차순 정렬
          </div>
        )}
      </div>
    </div>
  );
}
