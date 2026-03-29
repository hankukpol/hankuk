import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ScheduleAlertSendButton } from "./schedule-alert-send-button";

export const dynamic = "force-dynamic";

type UpcomingExam = {
  id: number;
  name: string;
  examType: "GONGCHAE" | "GYEONGCHAE";
  year: number;
  writtenDate: string | null;
  interviewDate: string | null;
  resultDate: string | null;
  description: string | null;
  isActive: boolean;
  daysUntilWritten: number | null;
  daysUntilInterview: number | null;
};

type RecentAlert = {
  id: number;
  message: string;
  sentAt: string;
  status: string;
};

const EXAM_TYPE_LABELS: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

/** D-day presets — which days trigger automatic cron notifications */
const ALERT_PRESETS = [
  { label: "D-30", days: 30, description: "시험 30일 전 — 원서 접수 마감 안내" },
  { label: "D-14", days: 14, description: "시험 2주 전 — 최종 정리 시작 독려" },
  { label: "D-7", days: 7, description: "시험 1주 전 — 집중 복습 독려" },
  { label: "D-3", days: 3, description: "시험 3일 전 — 마무리 확인 안내" },
  { label: "D-1", days: 1, description: "시험 전날 — 최종 점검 알림" },
];

function calcDaysUntil(date: Date | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.replace(/-/g, ".");
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-slate text-xs">—</span>;
  if (days < 0) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
        D+{Math.abs(days)}
      </span>
    );
  }
  if (days < 7) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
        D-{days}
      </span>
    );
  }
  if (days < 14) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
        D-{days}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
      D-{days}
    </span>
  );
}

export default async function CivilExamScheduleAlertsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);

  // Fetch active exams that have at least one date within 30 days
  const rawExams = await prisma.civilServiceExam.findMany({
    where: {
      isActive: true,
      OR: [
        { writtenDate: { gte: today, lte: cutoff } },
        { interviewDate: { gte: today, lte: cutoff } },
        { resultDate: { gte: today, lte: cutoff } },
      ],
    },
    orderBy: [{ writtenDate: "asc" }, { year: "desc" }],
  });

  const upcomingExams: UpcomingExam[] = rawExams.map((e) => ({
    id: e.id,
    name: e.name,
    examType: e.examType as "GONGCHAE" | "GYEONGCHAE",
    year: e.year,
    writtenDate: e.writtenDate ? e.writtenDate.toISOString().split("T")[0] : null,
    interviewDate: e.interviewDate ? e.interviewDate.toISOString().split("T")[0] : null,
    resultDate: e.resultDate ? e.resultDate.toISOString().split("T")[0] : null,
    description: e.description,
    isActive: e.isActive,
    daysUntilWritten: calcDaysUntil(e.writtenDate),
    daysUntilInterview: calcDaysUntil(e.interviewDate),
  }));

  // Fetch last 10 system notices related to civil exam alerts
  const recentLogs = await prisma.notificationLog.findMany({
    where: {
      type: "NOTICE",
      message: { contains: "시험" },
    },
    orderBy: { sentAt: "desc" },
    take: 10,
    select: {
      id: true,
      message: true,
      sentAt: true,
      status: true,
    },
  });

  const recentAlerts: RecentAlert[] = recentLogs.map((l) => ({
    id: l.id,
    message: l.message,
    sentAt: l.sentAt.toISOString(),
    status: l.status,
  }));

  const hasUpcoming = upcomingExams.length > 0;

  // Determine which preset D-days are "active" (i.e., an upcoming exam hits that threshold today)
  const activeTodayPresets = new Set<number>();
  for (const exam of upcomingExams) {
    const d = exam.daysUntilWritten;
    if (d !== null) {
      for (const preset of ALERT_PRESETS) {
        if (d === preset.days) activeTodayPresets.add(preset.days);
      }
    }
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시험 관리
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">시험 일정 알림</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            30일 이내 예정된 공무원 시험 일정을 확인하고 수강생들에게 알림을 발송합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/civil-exams"
            className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            ← 시험 관리 홈
          </Link>
          <Link
            href="/admin/settings/civil-exams"
            className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            시험 일정 관리
          </Link>
          {hasUpcoming && (
            <ScheduleAlertSendButton examCount={upcomingExams.length} />
          )}
        </div>
      </div>

      {/* Alert Presets Table */}
      <section className="mt-8">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">알림 발송 기준 설정</h2>
          <span className="inline-flex rounded-full bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
            Cron 자동화
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate">
          Cron 스케줄러가 매일 00:00에 아래 D-day에 해당하는 시험이 있으면 자동으로 카카오 알림톡을 발송합니다.
        </p>
        <div className="mt-4 overflow-hidden rounded-[24px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-5 py-3.5 font-semibold text-ink">D-day 기준</th>
                <th className="px-5 py-3.5 font-semibold text-ink">알림 내용</th>
                <th className="px-5 py-3.5 font-semibold text-ink">오늘 해당 여부</th>
                <th className="px-5 py-3.5 font-semibold text-ink">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5 bg-white">
              {ALERT_PRESETS.map((preset) => {
                const isToday = activeTodayPresets.has(preset.days);
                return (
                  <tr
                    key={preset.days}
                    className={`transition-colors ${isToday ? "bg-ember/5" : "hover:bg-mist/30"}`}
                  >
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${
                          isToday
                            ? "bg-ember text-white"
                            : "border border-ink/10 bg-mist text-ink"
                        }`}
                      >
                        {preset.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate">{preset.description}</td>
                    <td className="px-5 py-3.5">
                      {isToday ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
                          오늘 발송 대상
                        </span>
                      ) : (
                        <span className="text-xs text-slate">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                        활성
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Upcoming Exams */}
      <section className="mt-10">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">30일 이내 예정 시험</h2>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              hasUpcoming
                ? "bg-ember/10 text-ember"
                : "bg-mist text-slate"
            }`}
          >
            {upcomingExams.length}건
          </span>
        </div>

        {!hasUpcoming ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 py-16 text-center text-sm text-slate">
            30일 이내 예정된 시험 일정이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-ink">시험명</th>
                  <th className="px-5 py-3.5 font-semibold text-ink">유형</th>
                  <th className="px-5 py-3.5 font-semibold text-ink">연도</th>
                  <th className="px-5 py-3.5 font-semibold text-ink">필기시험일</th>
                  <th className="px-5 py-3.5 font-semibold text-ink">필기 D-Day</th>
                  <th className="px-5 py-3.5 font-semibold text-ink">면접시험일</th>
                  <th className="px-5 py-3.5 font-semibold text-ink">면접 D-Day</th>
                  <th className="px-5 py-3.5 font-semibold text-ink">최종발표일</th>
                  <th className="px-5 py-3.5 font-semibold text-ink">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 bg-white">
                {upcomingExams.map((exam) => {
                  const isUrgent =
                    (exam.daysUntilWritten !== null && exam.daysUntilWritten >= 0 && exam.daysUntilWritten < 7) ||
                    (exam.daysUntilInterview !== null && exam.daysUntilInterview >= 0 && exam.daysUntilInterview < 7);
                  return (
                    <tr
                      key={exam.id}
                      className={`transition-colors hover:bg-mist/40 ${isUrgent ? "bg-red-50/30" : ""}`}
                    >
                      <td className="px-5 py-4 font-medium text-ink">
                        {exam.name}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                            exam.examType === "GONGCHAE"
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-ember/20 bg-ember/10 text-ember"
                          }`}
                        >
                          {EXAM_TYPE_LABELS[exam.examType] ?? exam.examType}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate">{exam.year}년</td>
                      <td className="px-5 py-4 font-mono text-xs text-ink">
                        {formatDate(exam.writtenDate)}
                      </td>
                      <td className="px-5 py-4">
                        <DaysBadge days={exam.daysUntilWritten} />
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-ink">
                        {formatDate(exam.interviewDate)}
                      </td>
                      <td className="px-5 py-4">
                        <DaysBadge days={exam.daysUntilInterview} />
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate">
                        {formatDate(exam.resultDate)}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate max-w-[200px] truncate">
                        {exam.description ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Legend */}
      {hasUpcoming && (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-red-200" />
            7일 미만 (긴급)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-200" />
            14일 미만 (주의)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-green-200" />
            14일 이상 (안전)
          </span>
        </div>
      )}

      {/* Recent Alert Log */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">최근 발송 알림 로그</h2>
        <p className="mt-1 text-xs text-slate">
          시험 관련 알림 발송 이력 (최근 10건)
        </p>

        {recentAlerts.length === 0 ? (
          <div className="mt-4 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            발송된 알림 이력이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-[20px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-3 font-semibold text-ink">발송 일시</th>
                  <th className="px-5 py-3 font-semibold text-ink">메시지</th>
                  <th className="px-5 py-3 font-semibold text-ink">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 bg-white">
                {recentAlerts.map((log) => {
                  const sentDate = new Date(log.sentAt);
                  return (
                    <tr key={log.id} className="hover:bg-mist/30">
                      <td className="px-5 py-3 font-mono text-xs text-slate whitespace-nowrap">
                        {sentDate.toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })}{" "}
                        {sentDate.toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3 text-ink max-w-md truncate">
                        {log.message}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            log.status === "sent"
                              ? "bg-forest/10 text-forest"
                              : log.status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-mist text-slate"
                          }`}
                        >
                          {log.status === "sent"
                            ? "발송 완료"
                            : log.status === "failed"
                            ? "실패"
                            : log.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
