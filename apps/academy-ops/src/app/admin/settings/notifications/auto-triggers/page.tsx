import Link from "next/link";
import { AdminRole, NotificationType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/system-config";
import { TriggerToggle } from "./trigger-toggle";

export const dynamic = "force-dynamic";

// ─── Trigger Definitions ──────────────────────────────────────────────────────

type TriggerDef = {
  key: string;
  label: string;
  description: string;
  notificationType: NotificationType;
  defaultEnabled: boolean;
};

const TRIGGER_DEFS: TriggerDef[] = [
  {
    key: "ENROLLMENT_COMPLETE",
    label: "수강 등록 완료",
    description: "수강 등록 처리 시 학생에게 자동 발송",
    notificationType: NotificationType.ENROLLMENT_COMPLETE,
    defaultEnabled: true,
  },
  {
    key: "PAYMENT_COMPLETE",
    label: "결제 완료",
    description: "수납 완료 시 학생에게 자동 발송",
    notificationType: NotificationType.PAYMENT_COMPLETE,
    defaultEnabled: true,
  },
  {
    key: "REFUND_COMPLETE",
    label: "환불 완료",
    description: "환불 승인 처리 시 학생에게 자동 발송",
    notificationType: NotificationType.REFUND_COMPLETE,
    defaultEnabled: true,
  },
  {
    key: "ABSENCE_NOTE",
    label: "결석 확인서 처리 결과",
    description: "사유서 승인/반려 처리 후 학생에게 자동 발송",
    notificationType: NotificationType.ABSENCE_NOTE,
    defaultEnabled: true,
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AutoTriggersPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();

  // Load current system config for trigger states
  const systemConfig = await getSystemConfig();
  const rawConfig = systemConfig as Record<string, unknown>;
  const triggerStates = (rawConfig.notificationTriggers ?? {}) as Record<string, boolean>;

  // Load last sent date per trigger type
  const recentLogs = await prisma.notificationLog.findMany({
    where: {
      type: {
        in: TRIGGER_DEFS.map((t) => t.notificationType),
      },
    },
    orderBy: { sentAt: "desc" },
    select: {
      type: true,
      sentAt: true,
      status: true,
    },
    distinct: ["type"],
  });

  const lastSentMap = new Map<NotificationType, { date: Date; status: string }>();
  for (const log of recentLogs) {
    if (!lastSentMap.has(log.type)) {
      lastSentMap.set(log.type, { date: log.sentAt, status: log.status });
    }
  }

  // Total counts per type (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const countResults = await prisma.notificationLog.groupBy({
    by: ["type"],
    where: {
      type: { in: TRIGGER_DEFS.map((t) => t.notificationType) },
      sentAt: { gte: thirtyDaysAgo },
    },
    _count: { id: true },
  });

  const countMap = new Map<NotificationType, number>();
  for (const r of countResults) {
    countMap.set(r.type, r._count.id);
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 &rsaquo; 알림
      </div>
      <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-ink">자동 알림 트리거 설정</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            이벤트 발생 시 자동으로 학생에게 카카오 알림톡을 발송하는 트리거를 관리합니다.
            학생의 수신 동의가 있어야 실제 발송됩니다.
          </p>
        </div>
        <Link
          href="/admin/settings/notification-rules"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
        >
          발송 규칙 전체 보기
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 11L11 3M11 3H6M11 3v5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>

      {/* Info banner */}
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong className="font-semibold">주의:</strong> 트리거를 비활성화하면 해당 이벤트 발생 시
        알림이 발송되지 않습니다. 수신 동의 학생에게도 발송이 중단됩니다.
        변경 사항은 즉시 적용됩니다.
      </div>

      {/* Triggers table */}
      <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/5 bg-mist/40 px-6 py-4">
          <h2 className="font-semibold text-ink">자동 트리거 목록</h2>
          <p className="mt-0.5 text-xs text-slate">
            ON 상태일 때 해당 이벤트 발생 시 자동으로 알림이 발송됩니다.
          </p>
        </div>

        <div className="divide-y divide-ink/5">
          {TRIGGER_DEFS.map((trigger) => {
            const isEnabled =
              trigger.key in triggerStates
                ? triggerStates[trigger.key]
                : trigger.defaultEnabled;
            const lastSent = lastSentMap.get(trigger.notificationType);
            const count30d = countMap.get(trigger.notificationType) ?? 0;

            return (
              <div
                key={trigger.key}
                className="flex items-center justify-between gap-4 px-6 py-5"
              >
                {/* Left: trigger info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{trigger.label}</span>
                    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                      카카오 알림톡
                    </span>
                    {count30d > 0 && (
                      <span className="text-xs text-slate">
                        최근 30일 {count30d.toLocaleString()}건
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate">{trigger.description}</p>
                  {lastSent ? (
                    <p className="mt-1 text-xs text-slate/70">
                      마지막 발송:{" "}
                      <span
                        className={
                          lastSent.status === "failed"
                            ? "text-red-600 font-medium"
                            : "text-ink/60"
                        }
                      >
                        {formatRelativeDate(lastSent.date)}
                        {lastSent.status === "failed" ? " (실패)" : ""}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate/50">마지막 발송: -</p>
                  )}
                </div>

                {/* Right: status + toggle */}
                <div className="flex items-center gap-4 shrink-0">
                  <span
                    className={[
                      "hidden sm:inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                      isEnabled
                        ? "border-forest/20 bg-forest/10 text-forest"
                        : "border-slate/20 bg-slate/10 text-slate",
                    ].join(" ")}
                  >
                    {isEnabled ? "활성" : "비활성"}
                  </span>
                  <TriggerToggle triggerKey={trigger.key} enabled={isEnabled} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Note about PATCH permission */}
      <p className="mt-4 text-xs text-slate/60">
        트리거 활성화/비활성화 설정 변경은 SUPER_ADMIN 권한이 필요합니다.
      </p>

      {/* Back link */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/settings/notification-rules"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 알림 발송 규칙으로
        </Link>
        <Link
          href="/admin/settings/notification-templates"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-5 py-2.5 text-sm font-medium text-forest transition hover:bg-forest/10"
        >
          알림 템플릿 설정
        </Link>
      </div>
    </div>
  );
}
