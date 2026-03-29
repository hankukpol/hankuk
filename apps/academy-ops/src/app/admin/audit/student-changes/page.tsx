import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ROLE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// ─── Student-related actions ─────────────────────────────────────────────────
const STUDENT_ACTIONS = [
  "STUDENT_CREATE",
  "STUDENT_UPDATE",
  "STUDENT_DEACTIVATE",
  "STUDENT_REACTIVATE",
  "STUDENT_BULK_DEACTIVATE",
  "STUDENT_BULK_GENERATION_UPDATE",
  "STUDENT_PASTE_IMPORT",
  "STUDENT_MERGE",
  "STUDENT_TRANSFER",
  "STUDENT_NOTIFICATION_CONSENT_UPDATE",
  "STUDENT_TARGET_SCORES_UPDATE",
  "ENROLLMENT_CREATE",
  "ENROLLMENT_UPDATE",
  "ENROLLMENT_DELETE",
  "ENROLLMENT_CANCEL",
  "ENROLLMENT_COMPLETE",
  "ENROLLMENT_SUSPEND",
  "ENROLLMENT_RESUME",
  "PERIOD_ENROLLMENT_ADD",
  "PERIOD_ENROLLMENT_REMOVE",
  "PERIOD_ENROLLMENT_BULK_REMOVE",
];

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
  ENROLLMENT_CREATE: "수강 등록",
  ENROLLMENT_UPDATE: "수강 수정",
  ENROLLMENT_DELETE: "수강 삭제",
  ENROLLMENT_CANCEL: "수강 취소",
  ENROLLMENT_COMPLETE: "수강 완료",
  ENROLLMENT_SUSPEND: "수강 휴원",
  ENROLLMENT_RESUME: "수강 복교",
  PERIOD_ENROLLMENT_ADD: "기간 수강 추가",
  PERIOD_ENROLLMENT_REMOVE: "기간 수강 제거",
  PERIOD_ENROLLMENT_BULK_REMOVE: "기간 수강 일괄 제거",
};

function getActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

function getActionColor(action: string): string {
  if (
    action.endsWith("_CREATE") ||
    action.endsWith("_ADD") ||
    action.endsWith("_IMPORT") ||
    action === "STUDENT_REACTIVATE" ||
    action === "ENROLLMENT_RESUME"
  ) {
    return "border-forest/30 bg-forest/10 text-forest";
  }
  if (
    action.endsWith("_UPDATE") ||
    action.endsWith("_CHANGE") ||
    action.endsWith("_COMPLETE")
  ) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (
    action.endsWith("_DELETE") ||
    action.endsWith("_REMOVE") ||
    action.endsWith("_DEACTIVATE") ||
    action.endsWith("_CANCEL") ||
    action.endsWith("_SUSPEND")
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-ink/20 bg-ink/5 text-slate";
}

function formatLogDate(date: Date): string {
  return format(date, "yyyy-MM-dd(E)", { locale: ko });
}

function formatLogTime(date: Date): string {
  return format(date, "HH:mm:ss");
}

function truncate(value: unknown, maxLen = 100): string {
  if (value === null || value === undefined) return "-";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

// ─── Types ───────────────────────────────────────────────────────────────────
type PageProps = {
  searchParams?: {
    page?: string;
    examNumber?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
  };
};

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function StudentChangesAuditPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10));
  const limit = 50;

  const examNumber = searchParams?.examNumber?.trim() ?? "";
  const actionFilter = searchParams?.action?.trim() ?? "";

  // Default date range: last 30 days
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - 30);
  const defaultStartStr = format(defaultStart, "yyyy-MM-dd");

  const startDate = searchParams?.startDate?.trim() ?? defaultStartStr;
  const endDate = searchParams?.endDate?.trim() ?? "";

  // Build date filter
  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) {
    const d = new Date(startDate + "T00:00:00");
    if (!isNaN(d.getTime())) createdAtFilter.gte = d;
  }
  if (endDate) {
    const d = new Date(endDate + "T23:59:59");
    if (!isNaN(d.getTime())) createdAtFilter.lte = d;
  }

  // Only student-related actions
  const actionList = actionFilter
    ? STUDENT_ACTIONS.filter((a) => a.includes(actionFilter.toUpperCase()))
    : STUDENT_ACTIONS;

  const where = {
    action: { in: actionList },
    ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
    ...(examNumber
      ? {
          OR: [
            { targetId: { contains: examNumber } },
            {
              before: {
                path: ["examNumber"],
                string_contains: examNumber,
              },
            },
            {
              after: {
                path: ["examNumber"],
                string_contains: examNumber,
              },
            },
          ],
        }
      : {}),
  };

  const prisma = getPrisma();

  // KPI: today / this month
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayCount, monthCount, filteredTotal, logs, topChangers] =
    await Promise.all([
      prisma.auditLog.count({
        where: { action: { in: STUDENT_ACTIONS }, createdAt: { gte: todayStart } },
      }),
      prisma.auditLog.count({
        where: { action: { in: STUDENT_ACTIONS }, createdAt: { gte: monthStart } },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          admin: { select: { name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      // Top changer this month
      prisma.auditLog.groupBy({
        by: ["adminId"],
        where: {
          action: { in: STUDENT_ACTIONS },
          createdAt: { gte: monthStart },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 1,
      }),
    ]);

  // Resolve top changer name
  let topChangerName = "-";
  let topChangerCount = 0;
  if (topChangers.length > 0) {
    topChangerCount = topChangers[0]._count.id;
    const topAdmin = await prisma.adminUser.findUnique({
      where: { id: topChangers[0].adminId },
      select: { name: true },
    });
    topChangerName = topAdmin?.name ?? "-";
  }

  const totalPages = Math.ceil(filteredTotal / limit);

  function pageUrl(p: number): string {
    const params = new URLSearchParams();
    if (examNumber) params.set("examNumber", examNumber);
    if (actionFilter) params.set("action", actionFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("page", String(p));
    return `/admin/audit/student-changes?${params.toString()}`;
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        감사
      </div>
      <h1 className="mt-5 text-3xl font-semibold">학생 정보 변경 감사</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생 등록·수정·비활성, 수강 등록·변경·취소 등 학생 관련 모든 변경 이력을 조회합니다.
      </p>

      {/* "전체 감사 로그 보기" link */}
      <div className="mt-4">
        <Link
          href="/admin/audit-logs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ember underline-offset-4 hover:underline"
        >
          전체 감사 로그 보기 →
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">오늘 학생 정보 변경</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {todayCount.toLocaleString("ko-KR")}
            <span className="ml-1.5 text-base font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-6">
          <p className="text-sm text-sky-700">이번 달 학생 정보 변경</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">
            {monthCount.toLocaleString("ko-KR")}
            <span className="ml-1.5 text-base font-normal text-sky-600">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6">
          <p className="text-sm text-ember/80">이번 달 최다 변경 담당자</p>
          <p className="mt-2 text-xl font-bold text-ink truncate">{topChangerName}</p>
          {topChangerCount > 0 && (
            <p className="mt-1 text-sm text-slate">{topChangerCount.toLocaleString("ko-KR")}건</p>
          )}
        </div>
      </div>

      {/* Filter */}
      <form
        method="GET"
        action="/admin/audit/student-changes"
        className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 학번 */}
          <div>
            <label htmlFor="examNumber" className="mb-2 block text-sm font-medium">
              학번 검색
            </label>
            <input
              id="examNumber"
              type="text"
              name="examNumber"
              defaultValue={examNumber}
              placeholder="학번 입력"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>

          {/* 작업 유형 */}
          <div>
            <label htmlFor="action" className="mb-2 block text-sm font-medium">
              작업 유형
            </label>
            <select
              id="action"
              name="action"
              defaultValue={actionFilter}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="">전체 작업</option>
              <optgroup label="학생 정보">
                <option value="STUDENT_CREATE">학생 등록</option>
                <option value="STUDENT_UPDATE">학생 수정</option>
                <option value="STUDENT_DEACTIVATE">학생 비활성</option>
                <option value="STUDENT_REACTIVATE">학생 재활성</option>
              </optgroup>
              <optgroup label="수강 관리">
                <option value="ENROLLMENT_CREATE">수강 등록</option>
                <option value="ENROLLMENT_UPDATE">수강 수정</option>
                <option value="ENROLLMENT_CANCEL">수강 취소</option>
                <option value="ENROLLMENT_SUSPEND">수강 휴원</option>
                <option value="ENROLLMENT_RESUME">수강 복교</option>
              </optgroup>
            </select>
          </div>

          {/* 시작일 */}
          <div>
            <label htmlFor="startDate" className="mb-2 block text-sm font-medium">
              시작일
            </label>
            <input
              id="startDate"
              type="date"
              name="startDate"
              defaultValue={startDate}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>

          {/* 종료일 */}
          <div>
            <label htmlFor="endDate" className="mb-2 block text-sm font-medium">
              종료일
            </label>
            <input
              id="endDate"
              type="date"
              name="endDate"
              defaultValue={endDate}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-sm text-slate">
            {filteredTotal.toLocaleString("ko-KR")}건 조회됨
          </p>
          <div className="flex gap-3">
            <a
              href="/admin/audit/student-changes"
              className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/40"
            >
              초기화
            </a>
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
            >
              검색
            </button>
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white">
        {logs.length === 0 ? (
          <div className="p-16 text-center text-sm text-slate">
            조건에 맞는 학생 변경 로그가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">일시</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">담당자명</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">학번</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">액션</th>
                  <th className="px-5 py-4 font-semibold text-slate">변경 내용</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">IP</th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">상세</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => {
                  const isEven = idx % 2 === 0;
                  const actionColor = getActionColor(log.action);
                  const details = log.after ?? log.before;

                  // Try to extract examNumber from targetId or metadata
                  const logExamNumber =
                    log.action.startsWith("STUDENT_") ? log.targetId : null;

                  return (
                    <tr
                      key={log.id}
                      className={`border-b border-ink/5 transition hover:bg-mist/60 ${isEven ? "" : "bg-gray-50/40"}`}
                    >
                      {/* 일시 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <p className="font-medium text-ink">
                          {formatLogDate(log.createdAt)}
                        </p>
                        <p className="text-xs text-slate">{formatLogTime(log.createdAt)}</p>
                      </td>

                      {/* 담당자명 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink">
                            {log.admin.name}
                          </span>
                          <span className="mt-0.5 text-center text-[10px] text-slate/60">
                            {ROLE_LABEL[log.admin.role]}
                          </span>
                        </span>
                      </td>

                      {/* 학번 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        {logExamNumber ? (
                          <Link
                            href={`/admin/students/${logExamNumber}`}
                            className="font-mono text-sm font-semibold text-ember underline-offset-2 hover:underline"
                          >
                            {logExamNumber}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-slate">
                            {log.targetId}
                          </span>
                        )}
                      </td>

                      {/* 액션 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${actionColor}`}
                        >
                          {getActionLabel(log.action)}
                        </span>
                        <p className="mt-1 font-mono text-[10px] text-slate/60">
                          {log.action}
                        </p>
                      </td>

                      {/* 변경 내용 (metadata JSON preview) */}
                      <td className="max-w-xs px-5 py-3.5 align-top">
                        <p className="break-words text-xs leading-relaxed text-slate">
                          {truncate(details)}
                        </p>
                      </td>

                      {/* IP */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span className="font-mono text-xs text-slate">
                          {log.ipAddress ?? "-"}
                        </span>
                      </td>

                      {/* 상세 링크 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <Link
                          href={`/admin/audit-logs/${log.id}`}
                          className="inline-flex items-center rounded-full border border-ink/20 bg-white px-3 py-1 text-xs font-medium text-slate transition hover:border-ink/40 hover:text-ink"
                        >
                          상세 →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-ink/10 px-6 py-4">
            <p className="text-sm text-slate">
              {page} / {totalPages} 페이지 &nbsp;·&nbsp;{" "}
              {filteredTotal.toLocaleString("ko-KR")}건
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <a
                  href={pageUrl(page - 1)}
                  className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
                >
                  ← 이전
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate/40">
                  ← 이전
                </span>
              )}
              {page < totalPages ? (
                <a
                  href={pageUrl(page + 1)}
                  className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
                >
                  다음 →
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate/40">
                  다음 →
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
