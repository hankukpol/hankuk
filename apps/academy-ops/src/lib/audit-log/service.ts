import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type AuditLogFilters = {
  admin?: string;
  action?: string;
  date?: string;
  examNumber?: string;
};

function buildDateRange(date?: string) {
  if (!date) {
    return undefined;
  }

  const start = new Date(date);

  if (Number.isNaN(start.getTime())) {
    return undefined;
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    gte: start,
    lt: end,
  } satisfies Prisma.DateTimeFilter;
}

function matchesExamNumber(
  row: {
    targetId: string;
    before: Prisma.JsonValue | null;
    after: Prisma.JsonValue | null;
  },
  examNumber: string,
) {
  const keyword = examNumber.trim();

  if (!keyword) {
    return true;
  }

  if (row.targetId.includes(keyword)) {
    return true;
  }

  return [row.before, row.after].some((value) =>
    value ? JSON.stringify(value).includes(keyword) : false,
  );
}

export async function listAuditLogs(filters: AuditLogFilters) {
  const prisma = getPrisma();
  const admin = filters.admin?.trim();
  const action = filters.action?.trim();
  const examNumber = filters.examNumber?.trim();
  const rows = await prisma.auditLog.findMany({
    where: {
      action: action
        ? {
            contains: action,
          }
        : undefined,
      createdAt: buildDateRange(filters.date),
      admin: admin
        ? {
            OR: [
              {
                name: {
                  contains: admin,
                },
              },
              {
                email: {
                  contains: admin,
                },
              },
            ],
          }
        : undefined,
    },
    include: {
      admin: {
        select: {
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 300,
  });

  return examNumber ? rows.filter((row) => matchesExamNumber(row, examNumber)) : rows;
}
