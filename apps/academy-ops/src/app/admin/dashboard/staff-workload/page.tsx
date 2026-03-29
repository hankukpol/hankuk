import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { WorkloadClient } from "./workload-client";
import type { StaffWorkloadItem } from "@/app/api/admin/staff/workload/route";

export const dynamic = "force-dynamic";

export default async function StaffWorkloadPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const db = getPrisma();
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // COUNSELOR 이상 활성 AdminUser 조회
  const adminUsers = await db.adminUser.findMany({
    where: {
      isActive: true,
      role: {
        in: [
          AdminRole.COUNSELOR,
          AdminRole.ACADEMIC_ADMIN,
          AdminRole.MANAGER,
          AdminRole.DEPUTY_DIRECTOR,
          AdminRole.DIRECTOR,
          AdminRole.SUPER_ADMIN,
        ],
      },
    },
    select: {
      id: true,
      name: true,
      role: true,
    },
    orderBy: { name: "asc" },
  });

  const adminUserIds = adminUsers.map((u) => u.id);

  // Staff 테이블 매핑
  const staffRecords = await db.staff.findMany({
    where: { adminUserId: { in: adminUserIds } },
    select: { id: true, adminUserId: true },
  });
  const staffMap = new Map(
    staffRecords
      .filter((s): s is typeof s & { adminUserId: string } => s.adminUserId !== null)
      .map((s) => [s.adminUserId, s.id]),
  );

  // 최근 30일 상담 기록
  const recentCounselingRecords = await db.counselingRecord.findMany({
    where: { counseledAt: { gte: thirtyDaysAgo, lte: now } },
    select: { counselorName: true, examNumber: true },
  });

  // 오늘 예약 (SCHEDULED)
  const todayAppts = await db.counselingAppointment.findMany({
    where: {
      scheduledAt: { gte: todayStart, lte: todayEnd },
      status: "SCHEDULED",
    },
    select: { counselorName: true },
  });

  // 이번 달 면담 기록
  const monthRecords = await db.counselingRecord.findMany({
    where: { counseledAt: { gte: monthStart, lte: monthEnd } },
    select: { counselorName: true },
  });

  // 미처리 상담 예약자 (담당 직원 기준)
  const pendingProspects =
    adminUserIds.length > 0
      ? await db.consultationProspect.findMany({
          where: {
            staffId: { in: adminUserIds },
            stage: { in: ["INQUIRY", "VISITING", "DECIDING"] },
          },
          select: { staffId: true },
        })
      : [];

  // 집계
  const recentStudentsByName = new Map<string, Set<string>>();
  for (const r of recentCounselingRecords) {
    const name = r.counselorName.trim();
    if (!recentStudentsByName.has(name)) recentStudentsByName.set(name, new Set());
    recentStudentsByName.get(name)!.add(r.examNumber);
  }

  const todayApptByName = new Map<string, number>();
  for (const a of todayAppts) {
    const name = a.counselorName.trim();
    todayApptByName.set(name, (todayApptByName.get(name) ?? 0) + 1);
  }

  const monthCountByName = new Map<string, number>();
  for (const r of monthRecords) {
    const name = r.counselorName.trim();
    monthCountByName.set(name, (monthCountByName.get(name) ?? 0) + 1);
  }

  const pendingByAdminId = new Map<string, number>();
  for (const p of pendingProspects) {
    pendingByAdminId.set(p.staffId, (pendingByAdminId.get(p.staffId) ?? 0) + 1);
  }

  const workload: StaffWorkloadItem[] = adminUsers.map((u) => ({
    adminUserId: u.id,
    staffId: staffMap.get(u.id) ?? null,
    name: u.name,
    role: u.role,
    recentCounseledStudents: recentStudentsByName.get(u.name)?.size ?? 0,
    todayAppointments: todayApptByName.get(u.name) ?? 0,
    pendingProspects: pendingByAdminId.get(u.id) ?? 0,
    thisMonthCounselingCount: monthCountByName.get(u.name) ?? 0,
  }));

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "대시보드", href: "/admin" },
          { label: "직원 업무 부하 현황" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            Staff Workload
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">직원 업무 부하 현황</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            상담 담당 직원별 최근 30일 담당 학생 수, 오늘 예약 건수, 미처리 상담 예약자 현황을 한눈에 파악합니다.
          </p>
        </div>

        <div className="mt-5 flex shrink-0 flex-wrap items-center gap-3 sm:mt-0">
          <Link
            href="/admin/dashboard/staff-performance"
            className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold text-slate transition hover:border-forest/30 hover:text-forest"
          >
            성과 분석
          </Link>
          <Link
            href="/admin/staff-settlements"
            className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-5 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20"
          >
            직원 정산
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <WorkloadClient workload={workload} today={now.toISOString()} />
      </div>
    </div>
  );
}
