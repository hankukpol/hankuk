"use client";

import type { AuditLogRow } from "./page";

const ACTION_LABEL: Record<string, string> = {
  CREATE_ENROLLMENT: "수강 등록",
  UPDATE_ENROLLMENT: "수강 정보 수정",
  WITHDRAW_ENROLLMENT: "퇴원 처리",
  ENROLLMENT_LEAVE: "휴원 처리",
  ENROLLMENT_RETURN: "복귀 처리",
  ENROLLMENT_STATUS_CHANGE: "상태 변경",
  ENROLLMENT_FEE_UPDATE: "수강료 수정",
  ENROLLMENT_CLASS_CHANGE: "반/기수 변경",
  CONTRACT_PRINT: "계약서 출력",
  PROMOTE_WAITLIST: "대기자 승격",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "수강 중",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
  WAITING: "대기자",
};

function formatMetadata(before: unknown, after: unknown): string | null {
  if (!before && !after) return null;

  const parts: string[] = [];

  const b = before as Record<string, unknown> | null;
  const a = after as Record<string, unknown> | null;

  if (b && a) {
    // Status change
    if (b.status !== undefined && a.status !== undefined && b.status !== a.status) {
      const fromLabel = STATUS_LABEL[b.status as string] ?? String(b.status);
      const toLabel = STATUS_LABEL[a.status as string] ?? String(a.status);
      parts.push(`상태: ${fromLabel} → ${toLabel}`);
    }
    // Cohort / class change
    if (b.cohortName !== undefined && a.cohortName !== undefined && b.cohortName !== a.cohortName) {
      parts.push(`기수: ${String(b.cohortName ?? "미배정")} → ${String(a.cohortName ?? "미배정")}`);
    }
    // Fee change
    if (b.finalFee !== undefined && a.finalFee !== undefined && b.finalFee !== a.finalFee) {
      parts.push(
        `수강료: ${Number(b.finalFee).toLocaleString()}원 → ${Number(a.finalFee).toLocaleString()}원`,
      );
    }
  } else if (a && !b) {
    // Creation — show key fields
    const af = a as Record<string, unknown>;
    if (af.status) {
      const statusLabel = STATUS_LABEL[af.status as string] ?? String(af.status);
      parts.push(`상태: ${statusLabel}`);
    }
    if (af.finalFee !== undefined) {
      parts.push(`수강료: ${Number(af.finalFee).toLocaleString()}원`);
    }
    if (af.courseName) {
      parts.push(`강좌: ${af.courseName}`);
    }
  } else if (b && !a) {
    // Deletion/before-only
    const bf = b as Record<string, unknown>;
    if (bf.status) {
      const statusLabel = STATUS_LABEL[bf.status as string] ?? String(bf.status);
      parts.push(`이전 상태: ${statusLabel}`);
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

type Props = {
  logs: AuditLogRow[];
};

export function EnrollmentHistorySection({ logs }: Props) {
  return (
    <div>
      <h3 className="text-lg font-semibold">변경 이력</h3>
      {logs.length === 0 ? (
        <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
          변경 이력이 없습니다.
        </div>
      ) : (
        <div className="mt-4 space-y-0">
          <ol className="relative border-l border-ink/10 ml-3">
            {logs.map((log) => {
              const label = ACTION_LABEL[log.action] ?? log.action;
              const detail = formatMetadata(log.before, log.after);
              const dt = new Date(log.createdAt);
              const dateStr = dt.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              });
              const timeStr = dt.toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <li key={log.id} className="mb-4 ml-4 last:mb-0">
                  {/* Timeline dot */}
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-ink/10 bg-mist" />
                  <div className="rounded-[18px] border border-ink/10 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
                      <span className="text-sm font-semibold text-ink">{label}</span>
                      <div className="flex items-center gap-2 text-xs text-slate">
                        <span>{dateStr} {timeStr}</span>
                        <span className="text-ink/30">|</span>
                        <span>{log.adminName}</span>
                      </div>
                    </div>
                    {detail ? (
                      <p className="mt-1 text-xs text-slate">{detail}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
