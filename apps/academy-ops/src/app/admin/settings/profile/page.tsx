import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/constants";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  STUDENT_CREATE: "학생 등록",
  STUDENT_UPDATE: "학생 수정",
  SCORE_UPDATE: "성적 수정",
  SCORE_DELETE: "성적 삭제",
  ABSENCE_NOTE_APPROVE: "사유서 승인",
  ABSENCE_NOTE_REJECT: "사유서 반려",
  COUNSELING_CREATE: "면담 기록 생성",
  COUNSELING_UPDATE: "면담 기록 수정",
  POINT_GRANT: "포인트 지급",
  NOTIFICATION_SEND: "알림 발송",
  NOTIFICATION_TEMPLATE_UPDATE: "알림 템플릿 수정",
  NOTICE_CREATE: "공지 생성",
  STAFF_INVITE: "직원 초대",
  STAFF_ROLE_CHANGE: "직원 권한 변경",
};

function getActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

function getRoleColor(role: AdminRole): string {
  switch (role) {
    case AdminRole.SUPER_ADMIN:
      return "border-red-200 bg-red-50 text-red-700";
    case AdminRole.DIRECTOR:
      return "border-purple-200 bg-purple-50 text-purple-700";
    case AdminRole.DEPUTY_DIRECTOR:
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case AdminRole.MANAGER:
      return "border-sky-200 bg-sky-50 text-sky-700";
    case AdminRole.ACADEMIC_ADMIN:
      return "border-teal-200 bg-teal-50 text-teal-700";
    case AdminRole.COUNSELOR:
      return "border-forest/20 bg-forest/10 text-forest";
    case AdminRole.TEACHER:
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-ink/10 bg-ink/5 text-slate";
  }
}

export default async function AdminProfilePage() {
  const context = await requireAdminContext(AdminRole.VIEWER);
  const { adminUser } = context;

  const prisma = getPrisma();

  // Last 5 audit log entries for this admin
  const recentLogs = await prisma.auditLog.findMany({
    where: { adminId: adminUser.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      createdAt: true,
    },
  });

  // Activity counts (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalActions, recentActions] = await Promise.all([
    prisma.auditLog.count({ where: { adminId: adminUser.id } }),
    prisma.auditLog.count({
      where: { adminId: adminUser.id, createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        설정 · 내 프로필
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">내 프로필</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        계정 정보를 확인하고 이름을 변경할 수 있습니다.
      </p>

      {/* Profile summary card */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-forest text-xl font-bold text-white">
                {adminUser.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-ink">
                  {adminUser.name}
                </h2>
                <p className="text-sm text-slate">{adminUser.email}</p>
              </div>
            </div>
          </div>
          <span
            className={`inline-flex rounded-full border px-4 py-1.5 text-sm font-semibold ${getRoleColor(adminUser.role)}`}
          >
            {ROLE_LABEL[adminUser.role]}
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink/10 bg-mist px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">
              가입일
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {format(adminUser.createdAt, "yyyy년 MM월 dd일", { locale: ko })}
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-mist px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">
              총 작업 건수
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {totalActions.toLocaleString("ko-KR")}건
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-mist px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">
              최근 30일 작업
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {recentActions.toLocaleString("ko-KR")}건
            </p>
          </div>
        </div>
      </div>

      {/* Profile edit form */}
      <div className="mt-8">
        <ProfileForm
          adminId={adminUser.id}
          initialName={adminUser.name}
          email={adminUser.email}
          role={adminUser.role}
        />
      </div>

      {/* Recent activity */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold text-ink">최근 활동</h2>
        <p className="mt-2 text-sm text-slate">내가 수행한 최근 작업 5건</p>

        {recentLogs.length === 0 ? (
          <p className="mt-4 text-sm text-slate/60">최근 활동 내역이 없습니다.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-ink/5 bg-mist/60 px-4 py-3"
              >
                <div>
                  <span className="text-sm font-medium text-ink">
                    {getActionLabel(log.action)}
                  </span>
                  <span className="mx-2 text-slate/40">·</span>
                  <span className="text-xs text-slate">{log.targetType}</span>
                  {log.targetId && log.targetId !== "—" && (
                    <>
                      <span className="mx-1 text-slate/40">/</span>
                      <span className="font-mono text-xs text-slate/70">
                        {log.targetId.length > 20
                          ? log.targetId.slice(0, 20) + "…"
                          : log.targetId}
                      </span>
                    </>
                  )}
                </div>
                <span className="whitespace-nowrap text-xs text-slate">
                  {format(log.createdAt, "MM-dd(E) HH:mm", { locale: ko })}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <a
            href={`/admin/settings/audit-logs?adminId=${adminUser.id}`}
            className="inline-flex items-center rounded-full border border-ink/20 bg-white px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/40 hover:text-ink"
          >
            전체 활동 기록 보기
          </a>
        </div>
      </div>
    </div>
  );
}
