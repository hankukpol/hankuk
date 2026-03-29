import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { applyDiscountCodeAcademyScope } from "@/lib/discount-codes/service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type RecentUsageRow = {
  id: number;
  examNumber: string;
  studentName: string;
  usedAt: string;
  discountAmount: number;
  codeId: number;
  code: string;
};

export type CodeStatRow = {
  id: number;
  code: string;
  type: string;
  discountType: string;
  discountValue: number;
  usageCount: number;
  maxUsage: number | null;
  isActive: boolean;
  totalDiscountAmount: number;
  recentUsages: Array<{
    id: number;
    examNumber: string;
    studentName: string;
    usedAt: string;
    discountAmount: number;
  }>;
};

export type StatsResponse = {
  data: {
    totalCodes: number;
    activeCodes: number;
    monthlyUsages: number;
    totalDiscountAmount: number;
    stats: CodeStatRow[];
    recentUsages: RecentUsageRow[];
  };
};

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const codes = await getPrisma().discountCode.findMany({
      where: applyDiscountCodeAcademyScope({}, academyId),
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        usages: {
          select: {
            id: true,
            examNumber: true,
            usedAt: true,
            payment: { select: { discountAmount: true } },
            student: { select: { name: true } },
          },
          orderBy: { usedAt: "desc" },
        },
      },
    });

    let totalDiscountAmount = 0;
    let monthlyUsages = 0;

    const stats: CodeStatRow[] = codes.map((code) => {
      let codeTotalDiscount = 0;
      let codeMonthlyUsages = 0;

      const recentUsages = code.usages.slice(0, 5).map((usage) => {
        const amount = usage.payment?.discountAmount ?? 0;
        return {
          id: usage.id,
          examNumber: usage.examNumber,
          studentName: usage.student.name,
          usedAt: usage.usedAt.toISOString(),
          discountAmount: amount,
        };
      });

      for (const usage of code.usages) {
        const amount = usage.payment?.discountAmount ?? 0;
        codeTotalDiscount += amount;
        if (usage.usedAt >= startOfMonth) {
          codeMonthlyUsages += 1;
        }
      }

      totalDiscountAmount += codeTotalDiscount;
      monthlyUsages += codeMonthlyUsages;

      return {
        id: code.id,
        code: code.code,
        type: code.type,
        discountType: code.discountType,
        discountValue: code.discountValue,
        usageCount: code.usages.length,
        maxUsage: code.maxUsage,
        isActive: code.isActive,
        totalDiscountAmount: codeTotalDiscount,
        recentUsages,
      };
    });

    const recentUsages = codes
      .flatMap<RecentUsageRow>((code) =>
        code.usages.map((usage) => ({
          id: usage.id,
          examNumber: usage.examNumber,
          studentName: usage.student.name,
          usedAt: usage.usedAt.toISOString(),
          discountAmount: usage.payment?.discountAmount ?? 0,
          codeId: code.id,
          code: code.code,
        })),
      )
      .sort((left, right) => new Date(right.usedAt).getTime() - new Date(left.usedAt).getTime())
      .slice(0, 10);

    return NextResponse.json({
      data: {
        totalCodes: codes.length,
        activeCodes: codes.filter((code) => code.isActive).length,
        monthlyUsages,
        totalDiscountAmount,
        stats,
        recentUsages,
      },
    } satisfies StatsResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "할인 코드 통계를 불러오지 못했습니다." },
      { status: 400 },
    );
  }
}