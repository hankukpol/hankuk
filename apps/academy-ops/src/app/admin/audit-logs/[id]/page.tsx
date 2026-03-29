import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ROLE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// ─── Action labels (duplicated from list page to keep this file self-contained) ─
const ACTION_LABEL: Record<string, string> = {
  STUDENT_CREATE: "학생 등록",
  STUDENT_UPDATE: "학생 수정",
  STUDENT_DEACTIVATE: "학생 비활성",
  STUDENT_REACTIVATE: "학생 재활성",
  STUDENT_BULK_DEACTIVATE: "학생 일괄 비활성",
  STUDENT_BULK_GENERATION_UPDATE: "학생 일괄 기수 변경",
  STUDENT_PASTE_IMPORT: "학생 붙여넣기 등록",
  STUDENT_MERGE: "학생 병합",
  STUDENT_TRANSFER: "수험번호 이전",
  STUDENT_NOTIFICATION_CONSENT_UPDATE: "알림 동의 변경",
  STUDENT_TARGET_SCORES_UPDATE: "목표 점수 변경",
  SCORE_UPDATE: "성적 수정",
  SCORE_DELETE: "성적 삭제",
  SCORE_SESSION_DELETE: "회차 성적 삭제",
  SESSION_LOCK: "회차 성적 잠금",
  SESSION_UNLOCK: "회차 성적 잠금 해제",
  PERIOD_CREATE: "시험 기간 생성",
  PERIOD_UPDATE: "시험 기간 수정",
  PERIOD_ACTIVATE: "시험 기간 활성화",
  PERIOD_GENERATE_SESSIONS: "회차 자동 생성",
  SESSION_CREATE: "회차 생성",
  PERIOD_ENROLLMENT_ADD: "기간 수강 추가",
  PERIOD_ENROLLMENT_REMOVE: "기간 수강 제거",
  PERIOD_ENROLLMENT_BULK_REMOVE: "기간 수강 일괄 제거",
  ABSENCE_NOTE_APPROVE: "사유서 승인",
  ABSENCE_NOTE_REJECT: "사유서 반려",
  ABSENCE_NOTE_REVERT: "사유서 소급",
  ABSENCE_NOTE_SESSION_CHANGE: "사유서 회차 변경",
  ABSENCE_NOTE_DELETE: "사유서 삭제",
  ABSENCE_NOTE_ATTACHMENT_UPLOAD: "사유서 첨부 업로드",
  ABSENCE_NOTE_ATTACHMENT_DELETE: "사유서 첨부 삭제",
  ABSENCE_NOTE_ATTACHMENT_DOWNLOAD: "사유서 첨부 다운로드",
  ABSENCE_NOTE_ATTACHMENT_STORAGE_CLEANUP_FAILED: "첨부 파일 정리 실패",
  ABSENCE_POLICY_CREATE: "사유 정책 생성",
  ABSENCE_POLICY_UPDATE: "사유 정책 수정",
  ABSENCE_POLICY_DELETE: "사유 정책 삭제",
  COUNSELING_CREATE: "면담 기록 생성",
  COUNSELING_UPDATE: "면담 기록 수정",
  COUNSELING_DELETE: "면담 기록 삭제",
  COUNSELING_CHANGE_STUDENT: "면담 학생 변경",
  APPOINTMENT_CREATE: "면담 일정 생성",
  APPOINTMENT_DELETE: "면담 일정 삭제",
  POINT_GRANT: "포인트 지급",
  NOTIFICATION_SEND: "알림 발송",
  NOTIFICATION_RETRY: "알림 재발송",
  RESEND_PAYMENT_RECEIPT: "영수증 재발송",
  NOTIFICATION_TEMPLATE_UPDATE: "알림 템플릿 수정",
  NOTICE_CREATE: "공지 생성",
  NOTICE_UPDATE: "공지 수정",
  NOTICE_DELETE: "공지 삭제",
  ADMIN_MEMO_CREATE: "메모 생성",
  ADMIN_MEMO_UPDATE: "메모 수정",
  ADMIN_MEMO_DELETE: "메모 삭제",
  WEEKLY_REPORT_EXPORT: "주간 보고서 내보내기",
  MIGRATION_STUDENTS_EXECUTE: "학생 데이터 이관",
  MIGRATION_STUDENTS_ROLLBACK: "학생 데이터 이관 롤백",
  MIGRATION_LEGACY_WORKBOOK_SCORES_EXECUTE: "레거시 성적 이관",
};

function getActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

function getActionColor(action: string): string {
  if (
    action.endsWith("_CREATE") ||
    action.endsWith("_ADD") ||
    action.endsWith("_IMPORT") ||
    action.endsWith("_GRANT") ||
    action.endsWith("_EXECUTE") ||
    action.endsWith("_UPLOAD") ||
    action === "PERIOD_ACTIVATE" ||
    action === "STUDENT_REACTIVATE"
  ) {
    return "border-forest/30 bg-forest/10 text-forest";
  }
  if (
    action.endsWith("_UPDATE") ||
    action.endsWith("_CHANGE") ||
    action === "PERIOD_GENERATE_SESSIONS" ||
    action === "SESSION_CREATE"
  ) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (
    action.endsWith("_DELETE") ||
    action.endsWith("_REMOVE") ||
    action.endsWith("_DEACTIVATE") ||
    action.endsWith("_ROLLBACK")
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (
    action.endsWith("_SEND") ||
    action.endsWith("_RETRY") ||
    action.endsWith("_DOWNLOAD") ||
    action.endsWith("_EXPORT")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (action.endsWith("_APPROVE")) {
    return "border-forest/30 bg-forest/10 text-forest";
  }
  if (action.endsWith("_REJECT") || action.endsWith("_REVERT")) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-ink/20 bg-ink/5 text-slate";
}

// ─── Page ───────────────────────────────────────────────────────────────────
type PageProps = {
  params: { id: string };
};

export default async function AuditLogDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const prisma = getPrisma();
  const log = await prisma.auditLog.findUnique({
    where: { id },
    include: {
      admin: { select: { name: true, email: true, role: true } },
    },
  });

  if (!log) notFound();

  const actionColor = getActionColor(log.action);

  function JsonBlock({ label, value }: { label: string; value: unknown }) {
    if (value === null || value === undefined) {
      return (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">{label}</p>
          <div className="rounded-[16px] border border-ink/10 bg-mist/40 px-4 py-3 text-sm text-slate/60 italic">
            없음
          </div>
        </div>
      );
    }
    const pretty = JSON.stringify(value, null, 2);
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">{label}</p>
        <pre className="overflow-x-auto rounded-[16px] border border-ink/10 bg-mist/60 px-4 py-3 text-xs leading-relaxed text-ink">
          {pretty}
        </pre>
      </div>
    );
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <Link
        href="/admin/audit-logs"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate transition hover:text-ink"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
            clipRule="evenodd"
          />
        </svg>
        감사 로그 목록
      </Link>

      {/* Header */}
      <div className="mt-6">
        <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
          감사 로그 #{log.id}
        </div>
        <h1 className="mt-4 text-3xl font-semibold">
          {getActionLabel(log.action)}
        </h1>
        <p className="mt-2 font-mono text-sm text-slate">{log.action}</p>
      </div>

      {/* Main card */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          {/* 작업 유형 */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">작업 유형</p>
            <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${actionColor}`}>
              {getActionLabel(log.action)}
            </span>
            <p className="mt-1 font-mono text-xs text-slate/60">{log.action}</p>
          </div>

          {/* 일시 */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">일시</p>
            <p className="text-sm font-semibold text-ink">
              {format(log.createdAt, "yyyy년 MM월 dd일 (E) HH:mm:ss", { locale: ko })}
            </p>
          </div>

          {/* 담당자 */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">담당자</p>
            <p className="text-sm font-semibold text-ink">{log.admin.name}</p>
            <p className="text-xs text-slate">{log.admin.email}</p>
            <span className="mt-1 inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-medium text-forest">
              {ROLE_LABEL[log.admin.role]}
            </span>
          </div>

          {/* 대상 */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">대상</p>
            <p className="text-sm font-semibold text-ink">{log.targetType}</p>
            <p className="font-mono text-xs text-slate">{log.targetId}</p>
          </div>

          {/* IP 주소 */}
          {log.ipAddress ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">IP 주소</p>
              <p className="font-mono text-sm text-ink">{log.ipAddress}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Before / After */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <JsonBlock label="변경 전 (Before)" value={log.before} />
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <JsonBlock label="변경 후 (After)" value={log.after} />
        </div>
      </div>
    </div>
  );
}
