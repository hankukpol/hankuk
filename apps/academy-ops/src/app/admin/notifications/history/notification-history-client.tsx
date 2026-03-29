"use client";

import { NotificationChannel, NotificationType } from "@prisma/client";
import { RetryButton } from "./retry-button";

// ─── Types ────────────────────────────────────────────────────────────────────
type Student = {
  examNumber: string;
  name: string;
  phone: string | null;
};

export type NotificationLogRow = {
  id: number;
  type: NotificationType;
  channel: NotificationChannel;
  status: string;
  message: string;
  failReason: string | null;
  sentAt: string;
  student: Student;
};

type MonthlyChartEntry = {
  month: string;
  sent: number;
  failed: number;
};

type Props = {
  logs: NotificationLogRow[];
  monthlyChart: MonthlyChartEntry[];
};

// ─── Constants ────────────────────────────────────────────────────────────────
const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  WARNING_1: "1차 경고",
  WARNING_2: "2차 경고",
  DROPOUT: "탈락",
  ABSENCE_NOTE: "사유서",
  POINT: "포인트 지급",
  NOTICE: "일반 공지",
  SCORE_DEADLINE: "성적 입력 마감",
  ENROLLMENT_COMPLETE: "수강 등록 완료",
  PAYMENT_COMPLETE: "수납 완료",
  REFUND_COMPLETE: "환불 완료",
  PAYMENT_OVERDUE: "미납 독촉",
};

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  ALIMTALK: "알림톡",
  SMS: "SMS",
  WEB_PUSH: "웹 푸시",
};

const CHANNEL_COLOR: Record<NotificationChannel, string> = {
  ALIMTALK: "border-amber-200 bg-amber-50 text-amber-800",
  SMS: "border-sky-200 bg-sky-50 text-sky-800",
  WEB_PUSH: "border-purple-200 bg-purple-50 text-purple-800",
};

function getStatusBadge(status: string) {
  if (status === "sent") return { label: "성공", color: "border-forest/30 bg-forest/10 text-forest" };
  if (status === "failed") return { label: "실패", color: "border-red-200 bg-red-50 text-red-700" };
  if (status === "retried") return { label: "재발송됨", color: "border-ink/20 bg-ink/5 text-slate" };
  if (status === "skipped") return { label: "제외", color: "border-ink/10 bg-ink/5 text-slate/60" };
  return { label: status, color: "border-ink/20 bg-ink/5 text-slate" };
}

function formatSentAt(iso: string): string {
  const d = new Date(iso);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const day = days[d.getDay()];
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${ymd}(${day}) ${hm}`;
}

// ─── Monthly Bar Chart ────────────────────────────────────────────────────────
function MonthlyBarChart({ data }: { data: MonthlyChartEntry[] }) {
  const maxVal = Math.max(...data.map((d) => d.sent + d.failed), 1);

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8">
      <h3 className="mb-6 text-base font-semibold text-ink">월별 발송량 추이 (최근 6개월)</h3>
      <div className="flex items-end gap-3">
        {data.map((entry) => {
          const total = entry.sent + entry.failed;
          const sentPct = total > 0 ? (entry.sent / maxVal) * 100 : 0;
          const failedPct = total > 0 ? (entry.failed / maxVal) * 100 : 0;
          const monthLabel = entry.month.slice(5); // "MM"

          return (
            <div key={entry.month} className="group flex flex-1 flex-col items-center gap-1">
              {/* Tooltip */}
              <div className="relative">
                <div className="invisible absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg group-hover:visible">
                  <p className="font-semibold">{entry.month}</p>
                  <p>성공: {entry.sent.toLocaleString()}건</p>
                  <p>실패: {entry.failed.toLocaleString()}건</p>
                </div>
              </div>
              {/* Bars */}
              <div className="flex w-full flex-col-reverse gap-0.5" style={{ height: "120px" }}>
                {/* Failed bar */}
                {entry.failed > 0 && (
                  <div
                    className="w-full rounded-sm bg-red-400 transition-all"
                    style={{ height: `${failedPct}%` }}
                  />
                )}
                {/* Sent bar */}
                {entry.sent > 0 && (
                  <div
                    className="w-full rounded-sm bg-forest transition-all"
                    style={{ height: `${sentPct}%` }}
                  />
                )}
                {total === 0 && (
                  <div className="w-full rounded-sm bg-ink/5" style={{ height: "4px" }} />
                )}
              </div>
              {/* Month label */}
              <p className="text-xs font-medium text-slate">{monthLabel}월</p>
              <p className="text-xs text-slate/60">{total > 0 ? total.toLocaleString() : "-"}</p>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="mt-4 flex gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-forest" />
          <span className="text-xs text-slate">성공</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-red-400" />
          <span className="text-xs text-slate">실패</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────
export function NotificationHistoryClient({ logs, monthlyChart }: Props) {
  return (
    <div className="space-y-8">
      {/* Monthly chart */}
      {monthlyChart.length > 0 && <MonthlyBarChart data={monthlyChart} />}

      {/* Log Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white">
        {logs.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-sm text-slate">조건에 맞는 발송 이력이 없습니다.</p>
            <p className="mt-2 text-xs text-slate/60">
              알림톡이 발송되면 이 목록에 자동으로 기록됩니다.
            </p>
            <a
              href="/admin/notifications"
              className="mt-6 inline-flex items-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              알림 발송 페이지로 이동
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">발송일시</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">유형</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">채널</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">수신자</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">연락처</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">상태</th>
                  <th className="px-5 py-4 font-semibold text-slate">비고 / 재발송</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => {
                  const isEven = idx % 2 === 0;
                  const statusBadge = getStatusBadge(log.status);
                  const channelColor = CHANNEL_COLOR[log.channel];
                  const channelLabel = CHANNEL_LABEL[log.channel];
                  const typeLabel = NOTIFICATION_TYPE_LABEL[log.type] ?? log.type;
                  const canRetry = log.status === "failed";

                  return (
                    <tr
                      key={log.id}
                      className={`border-b border-ink/5 transition hover:bg-mist/60 ${isEven ? "" : "bg-gray-50/40"}`}
                    >
                      {/* 발송일시 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <p className="font-medium text-ink">{formatSentAt(log.sentAt)}</p>
                      </td>

                      {/* 유형 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink">
                          {typeLabel}
                        </span>
                      </td>

                      {/* 채널 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${channelColor}`}
                        >
                          {channelLabel}
                        </span>
                      </td>

                      {/* 수신자 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <a
                          href={`/admin/students/${log.student.examNumber}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {log.student.name}
                        </a>
                        <p className="font-mono text-xs text-slate">{log.student.examNumber}</p>
                      </td>

                      {/* 연락처 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span className="font-mono text-xs text-slate">
                          {log.student.phone ?? "-"}
                        </span>
                      </td>

                      {/* 상태 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge.color}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* 비고 / 재발송 */}
                      <td className="max-w-xs px-5 py-3.5 align-top">
                        {canRetry ? (
                          <div className="space-y-1">
                            {log.failReason && (
                              <p className="break-words text-xs leading-relaxed text-red-600">
                                {log.failReason}
                              </p>
                            )}
                            <RetryButton
                              logId={log.id}
                              channel={log.channel}
                              currentStatus={log.status}
                            />
                          </div>
                        ) : log.failReason ? (
                          <p className="break-words text-xs leading-relaxed text-red-600">
                            {log.failReason}
                          </p>
                        ) : (
                          <span className="text-xs text-slate/50">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
