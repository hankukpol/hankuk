import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type StaffWorkloadItem = {
  adminUserId: string;
  staffId: string | null;
  name: string;
  role: AdminRole;
  // 최근 30일 상담 학생 수 (고유)
  recentCounseledStudents: number;
  // 오늘 면담 예약 수
  todayAppointments: number;
  // 미처리 미결 상담예약자 (INQUIRY/VISITING/DECIDING stage)
  pendingProspects: number;
  // 이번 달 면담 기록 건수
  thisMonthCounselingCount: number;
};

/**
 * GET /api/admin/staff/workload
 * 상담 직원별 업무 부하 현황
 */
export async function GET() {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getPrisma();
  const now = new Date();

  // 기준 날짜 계산
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // COUNSELOR 이상 역할의 활성 AdminUser 조회
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

  if (adminUsers.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const adminUserIds = adminUsers.map((u) => u.id);

  // Staff 테이블에서 adminUserId 매핑
  const staffRecords = await db.staff.findMany({
    where: { adminUserId: { in: adminUserIds } },
    select: { id: true, adminUserId: true },
  });
  const staffMap = new Map(
    staffRecords
      .filter((s): s is typeof s & { adminUserId: string } => s.adminUserId !== null)
      .map((s) => [s.adminUserId, s.id]),
  );

  // 최근 30일 상담기록: counselorName 기반 → AdminUser.name 매핑
  // counselorName은 자유 텍스트이므로 name으로 매핑
  const recentCounselingRecords = await db.counselingRecord.findMany({
    where: { counseledAt: { gte: thirtyDaysAgo, lte: now } },
    select: { counselorName: true, examNumber: true },
  });

  // 오늘 예약 면담 (SCHEDULED 상태)
  const todayAppointments = await db.counselingAppointment.findMany({
    where: {
      scheduledAt: { gte: todayStart, lte: todayEnd },
      status: "SCHEDULED",
    },
    select: { counselorName: true },
  });

  // 이번 달 완료 면담 기록
  const monthCounselingRecords = await db.counselingRecord.findMany({
    where: { counseledAt: { gte: monthStart, lte: monthEnd } },
    select: { counselorName: true },
  });

  // 담당 직원별 미처리 상담 예약자 (INQUIRY/VISITING/DECIDING)
  const pendingProspects = await db.consultationProspect.findMany({
    where: {
      staffId: { in: adminUserIds },
      stage: { in: ["INQUIRY", "VISITING", "DECIDING"] },
    },
    select: { staffId: true },
  });

  // 집계 처리
  const recentStudentsByName = new Map<string, Set<string>>();
  for (const r of recentCounselingRecords) {
    const name = r.counselorName.trim();
    if (!recentStudentsByName.has(name)) recentStudentsByName.set(name, new Set());
    recentStudentsByName.get(name)!.add(r.examNumber);
  }

  const todayApptByName = new Map<string, number>();
  for (const a of todayAppointments) {
    const name = a.counselorName.trim();
    todayApptByName.set(name, (todayApptByName.get(name) ?? 0) + 1);
  }

  const monthCountByName = new Map<string, number>();
  for (const r of monthCounselingRecords) {
    const name = r.counselorName.trim();
    monthCountByName.set(name, (monthCountByName.get(name) ?? 0) + 1);
  }

  const pendingProspectsByAdminId = new Map<string, number>();
  for (const p of pendingProspects) {
    pendingProspectsByAdminId.set(
      p.staffId,
      (pendingProspectsByAdminId.get(p.staffId) ?? 0) + 1,
    );
  }

  // 결과 조합
  const workload: StaffWorkloadItem[] = adminUsers.map((u) => ({
    adminUserId: u.id,
    staffId: staffMap.get(u.id) ?? null,
    name: u.name,
    role: u.role,
    recentCounseledStudents: recentStudentsByName.get(u.name)?.size ?? 0,
    todayAppointments: todayApptByName.get(u.name) ?? 0,
    pendingProspects: pendingProspectsByAdminId.get(u.id) ?? 0,
    thisMonthCounselingCount: monthCountByName.get(u.name) ?? 0,
  }));

  return NextResponse.json({ data: workload });
}
