import { PointType } from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { getPointManagementData } from "@/lib/analytics/service";
import { getPrisma } from "@/lib/prisma";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";

type GrantPointEntry = {
  examNumber: string;
  type: PointType;
  amount: number;
  reason: string;
  periodId?: number | null;
  year?: number | null;
  month?: number | null;
};

export async function listAttendancePointCandidates(input: {
  periodId: number;
  examType: "GONGCHAE" | "GYEONGCHAE";
  year: number;
  month: number;
}) {
  const data = await getPointManagementData(
    input.periodId,
    input.examType,
    input.year,
    input.month,
  );

  return data.candidates.filter(
    (candidate) =>
      candidate.monthSessionCount > 0 && candidate.perfectAttendance && !candidate.alreadyGranted,
  );
}

export async function grantPoints(input: {
  adminId: string;
  adminName: string;
  entries: GrantPointEntry[];
  ipAddress?: string | null;
}) {
  if (input.entries.length === 0) {
    throw new Error("지급할 포인트 대상을 선택해 주세요.");
  }

  const normalizedEntries = input.entries.map((entry) => {
    const examNumber = entry.examNumber.trim();
    const reason = entry.reason.trim();

    if (!examNumber) {
      throw new Error("수험번호가 비어 있습니다.");
    }

    if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
      throw new Error("포인트 금액은 1 이상이어야 합니다.");
    }

    if (!reason) {
      throw new Error("지급 사유를 입력해 주세요.");
    }

    return {
      ...entry,
      examNumber,
      reason,
    };
  });

  const result = await getPrisma().$transaction(async (tx) => {
    const created = [];
    const skipped = [];

    for (const entry of normalizedEntries) {
      const existing =
        entry.type === PointType.PERFECT_ATTENDANCE && entry.periodId && entry.year && entry.month
          ? await tx.pointLog.findFirst({
              where: {
                examNumber: entry.examNumber,
                type: entry.type,
                periodId: entry.periodId,
                year: entry.year,
                month: entry.month,
              },
            })
          : null;

      if (existing) {
        skipped.push({
          examNumber: entry.examNumber,
          type: entry.type,
          reason: "이미 동일한 월 개근 포인트가 지급되어 있습니다.",
        });
        continue;
      }

      const log = await tx.pointLog.create({
        data: {
          examNumber: entry.examNumber,
          type: entry.type,
          amount: entry.amount,
          reason: entry.reason,
          periodId: entry.periodId ?? null,
          year: entry.year ?? null,
          month: entry.month ?? null,
          grantedBy: input.adminName,
        },
        include: {
          student: {
            select: {
              name: true,
            },
          },
        },
      });

      created.push(log);
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "POINT_GRANT",
        targetType: "PointLog",
        targetId: created.map((log) => String(log.id)).join(",") || "SKIPPED",
        before: toAuditJson(null),
        after: toAuditJson({
          created,
          skipped,
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    };
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}
