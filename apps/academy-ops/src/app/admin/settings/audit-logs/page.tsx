import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/constants";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  STUDENT_CREATE: "학생 등록",
  STUDENT_UPDATE: "학생 수정",
  STUDENT_DEACTIVATE: "학생 비활성",
  STUDENT_REACTIVATE: "학생 재활성",
  STUDENT_BULK_DEACTIVATE: "학생 일괄 비활성",
  STUDENT_BULK_GENERATION_UPDATE: "기수 일괄 변경",
  STUDENT_PASTE_IMPORT: "학생 붙여넣기 등록",
  STUDENT_MERGE: "학생 병합",
  STUDENT_TRANSFER: "수험번호 이전",
  STUDENT_NOTIFICATION_CONSENT_UPDATE: "알림 동의 변경",
  STUDENT_TARGET_SCORES_UPDATE: "목표 점수 변경",
  SCORE_UPDATE: "성적 수정",
  SCORE_DELETE: "성적 삭제",
  SCORE_SESSION_DELETE: "회차 성적 삭제",
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
  STAFF_INVITE: "직원 초대",
  STAFF_ROLE_CHANGE: "직원 권한 변경",
  STAFF_DEACTIVATE: "직원 비활성화",
  STAFF_ACTIVATE: "직원 활성화",
  CONTRACT_PRINT: "계약서 출력",
  CREATE_ACADEMY: "지점 생성",
  UPDATE_ACADEMY: "지점 수정",
  DEACTIVATE_ACADEMY: "지점 비활성화",
  REACTIVATE_ACADEMY: "지점 재활성화",
  INVITE_ADMIN_USER: "관리자 초대",
  UPDATE_ADMIN_USER: "관리자 수정",
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
    action.endsWith("_INVITE") ||
    action === "PERIOD_ACTIVATE" ||
    action === "STAFF_ACTIVATE" ||
    action === "STUDENT_REACTIVATE" ||
    action === "REACTIVATE_ACADEMY"
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
    action.endsWith("_ROLLBACK") ||
    action === "DEACTIVATE_ACADEMY"
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (
    action.endsWith("_SEND") ||
    action.endsWith("_RETRY") ||
    action.endsWith("_DOWNLOAD") ||
    action.endsWith("_EXPORT") ||
    action.endsWith("_PRINT")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (action.endsWith("_APPROVE")) return "border-forest/30 bg-forest/10 text-forest";
  if (action.endsWith("_REJECT") || action.endsWith("_REVERT")) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-ink/20 bg-ink/5 text-slate";
}

function formatLogDate(date: Date): string {
  return format(date, "yyyy-MM-dd(E)", { locale: ko });
}

function formatLogTime(date: Date): string {
  return format(date, "HH:mm:ss");
}

function truncate(value: unknown, maxLen = 80): string {
  if (value === null || value === undefined) return "-";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

type PageProps = {
  searchParams?: {
    page?: string;
    adminId?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    targetType?: string;
  };
};

export default async function SettingsAuditLogsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.DEPUTY_DIRECTOR);

  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10));
  const limit = 50;

  const adminId = searchParams?.adminId?.trim() ?? "";
  const action = searchParams?.action?.trim() ?? "";
  const startDate = searchParams?.startDate?.trim() ?? "";
  const endDate = searchParams?.endDate?.trim() ?? "";
  const targetType = searchParams?.targetType?.trim() ?? "";

  let createdAtFilter: { gte?: Date; lte?: Date } | undefined;
  if (startDate || endDate) {
    createdAtFilter = {};
    if (startDate) {
      const d = new Date(`${startDate}T00:00:00`);
      if (!Number.isNaN(d.getTime())) createdAtFilter.gte = d;
    }
    if (endDate) {
      const d = new Date(`${endDate}T23:59:59`);
      if (!Number.isNaN(d.getTime())) createdAtFilter.lte = d;
    }
  }

  const where = {
    ...(adminId ? { adminId } : {}),
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(targetType ? { targetType: { contains: targetType, mode: "insensitive" as const } } : {}),
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
  };

  const prisma = getPrisma();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const [totalLogs, todayCount, weekCount, filteredTotal, admins, logs] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.auditLog.count({ where }),
    prisma.adminUser.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.auditLog.findMany({
      where,
      include: { admin: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const totalPages = Math.ceil(filteredTotal / limit);

  function pageUrl(nextPage: number): string {
    const params = new URLSearchParams();
    if (adminId) params.set("adminId", adminId);
    if (action) params.set("action", action);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (targetType) params.set("targetType", targetType);
    params.set("page", String(nextPage));
    return `/admin/settings/audit-logs?${params.toString()}`;
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        설정 · 감사 로그
      </div>
      <h1 className="mt-5 text-3xl font-semibold">감사 로그</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        모든 관리자 작업의 이력을 조회합니다. 직원별 활동 추적과 보안 감사에 활용합니다.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">오늘 작업 수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{todayCount.toLocaleString("ko-KR")}</p>
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-6">
          <p className="text-sm text-sky-700">이번 주 작업 수</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">{weekCount.toLocaleString("ko-KR")}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">총 로그 수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalLogs.toLocaleString("ko-KR")}</p>
        </div>
      </div>

      <form method="GET" action="/admin/settings/audit-logs" className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div>
            <label htmlFor="adminId" className="mb-2 block text-sm font-medium">
              직원 선택
            </label>
            <select id="adminId" name="adminId" defaultValue={adminId} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
              <option value="">전체 직원</option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name} ({ROLE_LABEL[admin.role]})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="action" className="mb-2 block text-sm font-medium">
              작업 유형
            </label>
            <input id="action" type="text" name="action" defaultValue={action} placeholder="예: STAFF_INVITE" className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
          </div>
          <div>
            <label htmlFor="targetType" className="mb-2 block text-sm font-medium">
              대상 유형
            </label>
            <input id="targetType" type="text" name="targetType" defaultValue={targetType} placeholder="예: academy, admin_user" className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
          </div>
          <div>
            <label htmlFor="startDate" className="mb-2 block text-sm font-medium">
              시작일
            </label>
            <input id="startDate" type="date" name="startDate" defaultValue={startDate} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
          </div>
          <div>
            <label htmlFor="endDate" className="mb-2 block text-sm font-medium">
              종료일
            </label>
            <input id="endDate" type="date" name="endDate" defaultValue={endDate} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-sm text-slate">{filteredTotal.toLocaleString("ko-KR")}건 조회됨</p>
          <div className="flex gap-3">
            <a href="/admin/settings/audit-logs" className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/40">
              초기화
            </a>
            <button type="submit" className="inline-flex items-center rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90">
              검색
            </button>
          </div>
        </div>
      </form>

      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white">
        {logs.length === 0 ? (
          <div className="p-16 text-center text-sm text-slate">조건에 맞는 감사 로그가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">일시</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">직원</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">역할</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">작업 유형</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">대상</th>
                  <th className="px-5 py-4 font-semibold text-slate">상세</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => {
                  const details = log.after ?? log.before;
                  return (
                    <tr key={log.id} className={`border-b border-ink/5 transition hover:bg-mist/60 ${index % 2 !== 0 ? "bg-gray-50/40" : ""}`}>
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <p className="font-medium text-ink">{formatLogDate(log.createdAt)}</p>
                        <p className="text-xs text-slate">{formatLogTime(log.createdAt)}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <a href={`/admin/settings/staff/${log.adminId}`} className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink hover:border-forest/30 hover:bg-forest/5 hover:text-forest">
                          {log.admin.name}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-1 text-xs font-medium text-forest">
                          {ROLE_LABEL[log.admin.role]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getActionColor(log.action)}`}>
                          {getActionLabel(log.action)}
                        </span>
                        <p className="mt-1 font-mono text-[10px] text-slate/60">{log.action}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <p className="font-medium text-ink">{log.targetType}</p>
                        <p className="font-mono text-xs text-slate">{log.targetId}</p>
                      </td>
                      <td className="max-w-xs px-5 py-3.5 align-top">
                        <p className="break-words text-xs leading-relaxed text-slate">{truncate(details)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-ink/10 px-6 py-4">
            <p className="text-sm text-slate">
              {page} / {totalPages} 페이지 · {filteredTotal.toLocaleString("ko-KR")}건
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <a href={pageUrl(page - 1)} className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40">
                  ← 이전
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate/40">
                  ← 이전
                </span>
              )}
              {page < totalPages ? (
                <a href={pageUrl(page + 1)} className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40">
                  다음 →
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate/40">
                  다음 →
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
