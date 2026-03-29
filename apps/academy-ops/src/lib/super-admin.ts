import { randomUUID } from "crypto";
import {
  AcademyType,
  AdminRole,
  AttendType,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { ROLE_LABEL } from "@/lib/constants";
import { isLocalMockMode, hasServiceRoleConfig } from "@/lib/env";
import { hydrateDefaultExamSubjectsForAcademy } from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

const REVENUE_STATUSES: PaymentStatus[] = [
  PaymentStatus.APPROVED,
  PaymentStatus.PARTIAL_REFUNDED,
];

const UNPAID_TRACKING_STATUSES: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.APPROVED,
  PaymentStatus.PARTIAL_REFUNDED,
];

export const ACADEMY_TYPE_LABEL: Record<AcademyType, string> = {
  POLICE: "경찰",
  FIRE: "소방",
  CIVIL_SERVICE: "일반 공무원",
  OTHER: "기타",
};

export const SUPER_ADMIN_ROLE_OPTIONS: AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.DIRECTOR,
  AdminRole.DEPUTY_DIRECTOR,
  AdminRole.MANAGER,
  AdminRole.ACADEMIC_ADMIN,
  AdminRole.COUNSELOR,
  AdminRole.TEACHER,
  AdminRole.VIEWER,
];

export type AcademySummaryRow = {
  id: number;
  code: string;
  name: string;
  type: AcademyType;
  isActive: boolean;
  studentCount: number;
  adminCount: number;
  createdAt: string;
};

export type AcademyOption = {
  id: number;
  code: string;
  name: string;
  type: AcademyType;
  isActive: boolean;
};

export type SuperDashboardAcademyStat = {
  academyId: number;
  academyCode: string;
  academyName: string;
  academyType: AcademyType;
  isActive: boolean;
  studentCount: number;
  activeStudentCount: number;
  newStudentCount: number;
  monthlyRevenue: number;
  unpaidStudentCount: number;
  attendanceRate: number | null;
};

export const SUPER_DASHBOARD_PRESET_VALUES = ["today", "thisWeek", "thisMonth", "custom"] as const;
export type SuperDashboardPreset = (typeof SUPER_DASHBOARD_PRESET_VALUES)[number];

export type SuperDashboardFilterInput = {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  month?: string | null;
};

export type SuperDashboardStats = {
  filter: {
    preset: SuperDashboardPreset;
    fromDateValue: string;
    toDateValue: string;
    rangeLabel: string;
    helperText: string;
  };
  totals: {
    academyCount: number;
    activeAcademyCount: number;
    studentCount: number;
    activeStudentCount: number;
    newStudentCount: number;
    monthlyRevenue: number;
    unpaidStudentCount: number;
    attendanceRate: number | null;
  };
  academies: SuperDashboardAcademyStat[];
};

export type SuperAdminUserRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: AdminRole;
  roleLabel: string;
  academyId: number | null;
  academyName: string | null;
  academyCode: string | null;
  academyIsActive: boolean | null;
  isActive: boolean;
  createdAt: string;
};

type AcademyInput = {
  code: string;
  name: string;
  type: AcademyType;
};

type SuperAdminUserInput = {
  email: string;
  name: string;
  phone: string | null;
  role: AdminRole;
  academyId: number | null;
};

type AuditActor = {
  adminId: string;
  ipAddress?: string | null;
};

type AcademyAuditShape = {
  id: number;
  code: string;
  name: string;
  type: AcademyType;
  isActive: boolean;
};

type SuperAdminUserAuditShape = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: AdminRole;
  academyId: number | null;
  isActive: boolean;
};

type AdminUserRowPayload = Prisma.AdminUserGetPayload<{
  select: {
    id: true;
    email: true;
    name: true;
    phone: true;
    role: true;
    academyId: true;
    isActive: true;
    createdAt: true;
    academy: {
      select: {
        id: true;
        code: true;
        name: true;
        isActive: true;
      };
    };
  };
}>;

function normalizeAcademyCode(value: string) {
  return value.trim().toLowerCase();
}

function parseAcademyType(raw: unknown) {
  if (!Object.values(AcademyType).includes(raw as AcademyType)) {
    throw new Error("지점 유형을 올바르게 선택해 주세요.");
  }

  return raw as AcademyType;
}

function parseRole(raw: unknown) {
  if (!Object.values(AdminRole).includes(raw as AdminRole)) {
    throw new Error("관리자 권한을 올바르게 선택해 주세요.");
  }

  return raw as AdminRole;
}

function parseAcademyIdValue(raw: unknown) {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const academyId = Number(raw);
  if (!Number.isInteger(academyId) || academyId <= 0) {
    throw new Error("지점을 올바르게 선택해 주세요.");
  }

  return academyId;
}

function parseMonthInput(monthValue?: string | null) {
  const normalized = (monthValue ?? "").trim();
  const matched = /^(\d{4})-(\d{2})$/.exec(normalized);

  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]) - 1;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  return { start, end };
}

function parseDateInput(dateValue?: string | null) {
  const normalized = (dateValue ?? "").trim();
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);

  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]) - 1;
  const day = Number(matched[3]);
  return new Date(year, month, day);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatKoreanDateLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatDateRangeLabel(start: Date, endExclusive: Date) {
  const endInclusive = addDays(endExclusive, -1);
  return `${formatKoreanDateLabel(start)} ~ ${formatKoreanDateLabel(endInclusive)}`;
}

function startOfCurrentWeek(baseDate: Date) {
  const day = baseDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + diff);
}

function buildSuperDashboardFilter(
  preset: SuperDashboardPreset,
  start: Date,
  end: Date,
  helperText: string,
) {
  return {
    preset,
    start,
    end,
    fromDateValue: formatDateInputValue(start),
    toDateValue: formatDateInputValue(addDays(end, -1)),
    rangeLabel: formatDateRangeLabel(start, end),
    helperText,
  };
}

function resolveSuperDashboardFilter(input: SuperDashboardFilterInput = {}) {
  const preset = SUPER_DASHBOARD_PRESET_VALUES.includes(input.preset as SuperDashboardPreset)
    ? (input.preset as SuperDashboardPreset)
    : null;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (preset === "today") {
    return buildSuperDashboardFilter("today", todayStart, addDays(todayStart, 1), "오늘 기준 신규 등록, 수납, 출석 데이터를 비교합니다.");
  }

  if (preset === "thisWeek") {
    const start = startOfCurrentWeek(todayStart);
    return buildSuperDashboardFilter("thisWeek", start, addDays(start, 7), "이번 주 기준 신규 등록, 수납, 출석 데이터를 비교합니다.");
  }

  const fromDate = parseDateInput(input.from);
  const toDate = parseDateInput(input.to);
  if (preset === "custom" && fromDate && toDate && fromDate.getTime() <= toDate.getTime()) {
    return buildSuperDashboardFilter("custom", fromDate, addDays(toDate, 1), "직접 선택한 기간 기준 신규 등록, 수납, 출석 데이터를 비교합니다.");
  }

  const monthRange = parseMonthInput(input.month);
  if (monthRange) {
    return buildSuperDashboardFilter("custom", monthRange.start, monthRange.end, "선택한 월 기준 신규 등록, 수납, 출석 데이터를 비교합니다.");
  }

  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);
  return buildSuperDashboardFilter("thisMonth", monthStart, monthEnd, "이번 달 기준 신규 등록, 수납, 출석 데이터를 비교합니다.");
}

async function assertAcademyExists(academyId: number) {
  const academy = await getPrisma().academy.findUnique({
    where: { id: academyId },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
    },
  });

  if (!academy) {
    throw new Error("지점을 찾을 수 없습니다.");
  }

  return academy;
}

async function ensureAssignableAcademy(role: AdminRole, academyId: number | null) {
  if (role === AdminRole.SUPER_ADMIN) {
    return null;
  }

  if (academyId === null) {
    throw new Error("지점 관리자 계정은 소속 지점을 지정해야 합니다.");
  }

  return assertAcademyExists(academyId);
}

function buildAcademyAuditPayload(academy: AcademyAuditShape) {
  return {
    id: academy.id,
    code: academy.code,
    name: academy.name,
    type: academy.type,
    isActive: academy.isActive,
  } satisfies Prisma.InputJsonObject;
}

function buildSuperAdminUserAuditPayload(user: SuperAdminUserAuditShape) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    academyId: user.academyId,
    isActive: user.isActive,
  } satisfies Prisma.InputJsonObject;
}

async function writeSuperAdminAuditLog(
  tx: Prisma.TransactionClient,
  actor: AuditActor | undefined,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
) {
  if (!actor?.adminId) {
    return;
  }

  await tx.auditLog.create({
    data: {
      adminId: actor.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before,
      after: input.after,
      ipAddress: actor.ipAddress ?? null,
    },
  });
}

export function parseAcademyCreateInput(raw: Record<string, unknown>): AcademyInput {
  const code = normalizeAcademyCode(String(raw.code ?? ""));
  const name = String(raw.name ?? "").trim();
  const type = parseAcademyType(raw.type);

  if (!/^[a-z][a-z0-9-]{1,39}$/.test(code)) {
    throw new Error("지점 코드는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.");
  }

  if (name.length < 2 || name.length > 60) {
    throw new Error("지점명은 2자 이상 60자 이하로 입력해 주세요.");
  }

  return {
    code,
    name,
    type,
  };
}

export function parseAcademyUpdateInput(raw: Record<string, unknown>) {
  return parseAcademyCreateInput(raw);
}

export function parseSuperAdminUserInput(raw: Record<string, unknown>): SuperAdminUserInput {
  const email = String(raw.email ?? "").trim().toLowerCase();
  const name = String(raw.name ?? "").trim();
  const phoneRaw = String(raw.phone ?? "").trim();
  const phone = phoneRaw ? phoneRaw : null;
  const role = parseRole(raw.role);
  const academyId = parseAcademyIdValue(raw.academyId);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("이메일 주소를 올바르게 입력해 주세요.");
  }

  if (!name) {
    throw new Error("이름을 입력해 주세요.");
  }

  return {
    email,
    name,
    phone,
    role,
    academyId,
  };
}

export function parseSuperAdminUserUpdateInput(raw: Record<string, unknown>) {
  const name = String(raw.name ?? "").trim();
  const phoneRaw = String(raw.phone ?? "").trim();
  const phone = phoneRaw ? phoneRaw : null;
  const role = parseRole(raw.role);
  const academyId = parseAcademyIdValue(raw.academyId);
  const isActive = Boolean(raw.isActive);

  if (!name) {
    throw new Error("이름을 입력해 주세요.");
  }

  return {
    name,
    phone,
    role,
    academyId,
    isActive,
  };
}

export async function listAcademySummaries() {
  const academies = await getPrisma().academy.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          students: true,
          adminUsers: true,
        },
      },
    },
  });

  return academies.map<AcademySummaryRow>((academy) => ({
    id: academy.id,
    code: academy.code,
    name: academy.name,
    type: academy.type,
    isActive: academy.isActive,
    studentCount: academy._count.students,
    adminCount: academy._count.adminUsers,
    createdAt: academy.createdAt.toISOString(),
  }));
}

export async function listAcademyOptions() {
  const academies = await getPrisma().academy.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
    },
  });

  return academies satisfies AcademyOption[];
}

export async function createAcademyWithDefaults(input: AcademyInput, actor?: AuditActor) {
  const existing = await getPrisma().academy.findUnique({
    where: { code: input.code },
    select: { id: true },
  });

  if (existing) {
    throw new Error("이미 사용 중인 지점 코드입니다.");
  }

  return getPrisma().$transaction(async (tx) => {
    const academy = await tx.academy.create({
      data: {
        code: input.code,
        name: input.name,
        type: input.type,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        isActive: true,
        createdAt: true,
      },
    });

    await tx.academySettings.create({
      data: {
        academyId: academy.id,
        name: academy.name,
      },
    });

    await hydrateDefaultExamSubjectsForAcademy(academy.id, tx);

    await writeSuperAdminAuditLog(tx, actor, {
      action: "CREATE_ACADEMY",
      targetType: "academy",
      targetId: String(academy.id),
      after: buildAcademyAuditPayload(academy),
    });

    return academy;
  });
}

export async function updateAcademy(id: number, input: AcademyInput, actor?: AuditActor) {
  const academy = await assertAcademyExists(id);

  const duplicate = await getPrisma().academy.findFirst({
    where: {
      code: input.code,
      id: { not: academy.id },
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new Error("이미 사용 중인 지점 코드입니다.");
  }

  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.academy.update({
      where: { id: academy.id },
      data: {
        code: input.code,
        name: input.name,
        type: input.type,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        isActive: true,
        createdAt: true,
      },
    });

    await writeSuperAdminAuditLog(tx, actor, {
      action: "UPDATE_ACADEMY",
      targetType: "academy",
      targetId: String(updated.id),
      before: buildAcademyAuditPayload(academy),
      after: buildAcademyAuditPayload(updated),
    });

    return updated;
  });
}

export async function toggleAcademyActive(id: number, actor?: AuditActor) {
  const academy = await assertAcademyExists(id);

  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.academy.update({
      where: { id: academy.id },
      data: {
        isActive: !academy.isActive,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        isActive: true,
        createdAt: true,
      },
    });

    await writeSuperAdminAuditLog(tx, actor, {
      action: updated.isActive ? "REACTIVATE_ACADEMY" : "DEACTIVATE_ACADEMY",
      targetType: "academy",
      targetId: String(updated.id),
      before: buildAcademyAuditPayload(academy),
      after: buildAcademyAuditPayload(updated),
    });

    return updated;
  });
}

export async function getSuperDashboardStats(input: SuperDashboardFilterInput = {}): Promise<SuperDashboardStats> {
  const filter = resolveSuperDashboardFilter(input);
  const academies = await listAcademyOptions();

  const academyStats = await Promise.all(
    academies.map(async (academy) => {
      const [studentCount, activeStudentCount, newStudentCount, revenue, unpaidInstallments, attendanceTotal, attendancePresent] =
        await Promise.all([
          getPrisma().student.count({
            where: { academyId: academy.id },
          }),
          getPrisma().student.count({
            where: {
              academyId: academy.id,
              isActive: true,
            },
          }),
          getPrisma().student.count({
            where: {
              academyId: academy.id,
              registeredAt: {
                gte: filter.start,
                lt: filter.end,
              },
            },
          }),
          getPrisma().payment.aggregate({
            where: {
              academyId: academy.id,
              status: {
                in: REVENUE_STATUSES,
              },
              processedAt: {
                gte: filter.start,
                lt: filter.end,
              },
            },
            _sum: {
              netAmount: true,
            },
          }),
          getPrisma().installment.findMany({
            where: {
              dueDate: {
                lt: filter.end,
              },
              paidAt: null,
              payment: {
                academyId: academy.id,
                status: {
                  in: UNPAID_TRACKING_STATUSES,
                },
                examNumber: {
                  not: null,
                },
              },
            },
            select: {
              payment: {
                select: {
                  examNumber: true,
                },
              },
            },
          }),
          getPrisma().score.count({
            where: {
              academyId: academy.id,
              session: {
                examDate: {
                  gte: filter.start,
                  lt: filter.end,
                },
              },
            },
          }),
          getPrisma().score.count({
            where: {
              academyId: academy.id,
              attendType: {
                not: AttendType.ABSENT,
              },
              session: {
                examDate: {
                  gte: filter.start,
                  lt: filter.end,
                },
              },
            },
          }),
        ]);

      const unpaidStudentSet = new Set(
        unpaidInstallments
          .map((installment) => installment.payment.examNumber)
          .filter((examNumber): examNumber is string => Boolean(examNumber)),
      );

      return {
        academyId: academy.id,
        academyCode: academy.code,
        academyName: academy.name,
        academyType: academy.type,
        isActive: academy.isActive,
        studentCount,
        activeStudentCount,
        newStudentCount,
        monthlyRevenue: revenue._sum.netAmount ?? 0,
        unpaidStudentCount: unpaidStudentSet.size,
        attendanceRate:
          attendanceTotal === 0
            ? null
            : Math.round((attendancePresent / attendanceTotal) * 1000) / 10,
      } satisfies SuperDashboardAcademyStat;
    }),
  );

  const totalAttendanceSource = academyStats.filter((row) => row.attendanceRate !== null);
  const totalAttendanceRate =
    totalAttendanceSource.length === 0
      ? null
      : Math.round(
          (totalAttendanceSource.reduce((sum, row) => sum + (row.attendanceRate ?? 0), 0) /
            totalAttendanceSource.length) *
            10,
        ) / 10;

  return {
    filter: {
      preset: filter.preset,
      fromDateValue: filter.fromDateValue,
      toDateValue: filter.toDateValue,
      rangeLabel: filter.rangeLabel,
      helperText: filter.helperText,
    },
    totals: {
      academyCount: academyStats.length,
      activeAcademyCount: academyStats.filter((row) => row.isActive).length,
      studentCount: academyStats.reduce((sum, row) => sum + row.studentCount, 0),
      activeStudentCount: academyStats.reduce((sum, row) => sum + row.activeStudentCount, 0),
      newStudentCount: academyStats.reduce((sum, row) => sum + row.newStudentCount, 0),
      monthlyRevenue: academyStats.reduce((sum, row) => sum + row.monthlyRevenue, 0),
      unpaidStudentCount: academyStats.reduce((sum, row) => sum + row.unpaidStudentCount, 0),
      attendanceRate: totalAttendanceRate,
    },
    academies: academyStats,
  };
}

export async function listSuperAdminUsers() {
  const users = await getPrisma().adminUser.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      academyId: true,
      isActive: true,
      createdAt: true,
      academy: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
    },
  });

  return users.map(formatSuperAdminUserRow);
}

export async function inviteSuperAdminUser(input: SuperAdminUserInput, actor?: AuditActor) {
  await ensureAssignableAcademy(input.role, input.academyId);

  const existing = await getPrisma().adminUser.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw new Error("이미 등록된 관리자 이메일입니다.");
  }

  const localMockMode = isLocalMockMode();
  if (!localMockMode && !hasServiceRoleConfig()) {
    throw new Error("Supabase 서비스 역할 키가 없어 관리자 초대를 진행할 수 없습니다.");
  }

  let adminUserId = randomUUID() as `${string}-${string}-${string}-${string}-${string}`;

  if (!localMockMode && hasServiceRoleConfig()) {
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(input.email, {
      data: {
        display_name: input.name,
        admin_role: input.role,
      },
    });

    if (error || !data.user?.id) {
      throw new Error(error?.message ?? "관리자 초대 메일 발송에 실패했습니다.");
    }

    adminUserId = data.user.id as `${string}-${string}-${string}-${string}-${string}`;
  }

  const created = await getPrisma().$transaction(async (tx) => {
    const user = await tx.adminUser.create({
      data: {
        id: adminUserId,
        email: input.email,
        name: input.name,
        phone: input.phone,
        role: input.role,
        academyId: input.role === AdminRole.SUPER_ADMIN ? null : input.academyId,
        isActive: localMockMode ? true : false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        academyId: true,
        isActive: true,
        createdAt: true,
        academy: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    await writeSuperAdminAuditLog(tx, actor, {
      action: "INVITE_ADMIN_USER",
      targetType: "admin_user",
      targetId: user.id,
      after: buildSuperAdminUserAuditPayload(user),
    });

    return user;
  });

  return formatSuperAdminUserRow(created);
}

export async function updateSuperAdminUser(
  id: string,
  input: {
    name: string;
    phone: string | null;
    role: AdminRole;
    academyId: number | null;
    isActive: boolean;
  },
  currentUserId: string,
  actor?: AuditActor,
) {
  const existing = await getPrisma().adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      academyId: true,
      isActive: true,
    },
  });

  if (!existing) {
    throw new Error("관리자 계정을 찾을 수 없습니다.");
  }

  await ensureAssignableAcademy(input.role, input.academyId);

  if (existing.id === currentUserId) {
    if (input.role !== AdminRole.SUPER_ADMIN) {
      throw new Error("본인 계정의 최고 관리자 권한은 유지해야 합니다.");
    }

    if (!input.isActive) {
      throw new Error("본인 계정은 비활성화할 수 없습니다.");
    }
  }

  const updated = await getPrisma().$transaction(async (tx) => {
    const user = await tx.adminUser.update({
      where: { id },
      data: {
        name: input.name,
        phone: input.phone,
        role: input.role,
        academyId: input.role === AdminRole.SUPER_ADMIN ? null : input.academyId,
        isActive: input.isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        academyId: true,
        isActive: true,
        createdAt: true,
        academy: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    await writeSuperAdminAuditLog(tx, actor, {
      action: "UPDATE_ADMIN_USER",
      targetType: "admin_user",
      targetId: user.id,
      before: buildSuperAdminUserAuditPayload(existing),
      after: buildSuperAdminUserAuditPayload(user),
    });

    return user;
  });

  return formatSuperAdminUserRow(updated);
}

export function formatSuperAdminUserRow(user: AdminUserRowPayload) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    roleLabel: ROLE_LABEL[user.role],
    academyId: user.academyId,
    academyName: user.academy?.name ?? null,
    academyCode: user.academy?.code ?? null,
    academyIsActive: user.academy?.isActive ?? null,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  } satisfies SuperAdminUserRow;
}

