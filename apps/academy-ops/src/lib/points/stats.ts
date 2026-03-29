import { PointType } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type PointStatsSummary = {
  totalIssued: number;
  thisMonthIssued: number;
  totalBalance: number;
  beneficiaryCount: number;
  issuedByType: Array<{
    type: PointType;
    amount: number;
    count: number;
  }>;
  spentByType: Array<{
    type: PointType;
    amount: number;
    count: number;
  }>;
};

export async function getPointStatsSummary(): Promise<PointStatsSummary> {
  const prisma = getPrisma();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalIssued, thisMonthIssued, totalBalance, beneficiaryCount, groups] = await Promise.all([
    prisma.pointLog.aggregate({
      where: { amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.pointLog.aggregate({
      where: { amount: { gt: 0 }, grantedAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.pointLog.aggregate({
      _sum: { amount: true },
    }),
    prisma.pointLog
      .groupBy({
        by: ["examNumber"],
        where: { amount: { gt: 0 } },
        _count: true,
      })
      .then((rows) => rows.length),
    prisma.pointLog.groupBy({
      by: ["type"],
      _count: { type: true },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
  ]);

  return {
    totalIssued: totalIssued._sum.amount ?? 0,
    thisMonthIssued: thisMonthIssued._sum.amount ?? 0,
    totalBalance: totalBalance._sum.amount ?? 0,
    beneficiaryCount,
    issuedByType: groups
      .filter((row) => (row._sum.amount ?? 0) > 0)
      .map((row) => ({
        type: row.type,
        amount: row._sum.amount ?? 0,
        count: row._count.type,
      })),
    spentByType: groups
      .filter((row) => (row._sum.amount ?? 0) < 0)
      .map((row) => ({
        type: row.type,
        amount: Math.abs(row._sum.amount ?? 0),
        count: row._count.type,
      })),
  };
}
