import { CodeType, DiscountType } from "@prisma/client";
import { applyDiscountCodeAcademyScope, applyDiscountCodeUsageAcademyScope } from "@/lib/discount-codes/service";
import { getPrisma } from "@/lib/prisma";

export type DiscountCodeMonthOption = {
  value: string;
  label: string;
};

export type DiscountCodeUsageRow = {
  id: number;
  codeId: number;
  code: string;
  examNumber: string;
  studentName: string;
  mobile: string | null;
  usedAt: string;
  discountAmount: number;
};

export type DiscountCodeAnalyticsRow = {
  id: number;
  code: string;
  type: CodeType;
  discountType: DiscountType;
  discountValue: number;
  maxUsage: number | null;
  totalUsageCount: number;
  periodUsageCount: number;
  periodTotalDiscount: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
};

export type DiscountCodeAnalyticsData = {
  period: string;
  periodLabel: string;
  codes: Array<{
    id: number;
    code: string;
    type: CodeType;
    discountType: DiscountType;
    discountValue: number;
    maxUsage: number | null;
    usageCount: number;
    validFrom: string;
    validUntil: string | null;
    isActive: boolean;
    createdAt: string;
    staff: { name: string } | null;
  }>;
  rows: DiscountCodeAnalyticsRow[];
  recentUsages: DiscountCodeUsageRow[];
  summary: {
    totalCodes: number;
    activeCodes: number;
    usedCodes: number;
    totalUsageCount: number;
    totalDiscountAmount: number;
    expiringSoonCount: number;
  };
};

export function buildDiscountCodeMonthOptions(monthCount = 12): DiscountCodeMonthOption[] {
  const options: DiscountCodeMonthOption[] = [];
  const now = new Date();

  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    options.push({
      value: `${year}-${String(month).padStart(2, "0")}`,
      label: `${year}년 ${month}월`,
    });
  }

  return options;
}

export function resolveDiscountCodePeriod(period: string | null | undefined) {
  if (period === "all") {
    return {
      key: "all",
      label: "전체 기간",
      dateFilter: null as { gte: Date; lt: Date } | null,
    };
  }

  if (period && /^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split("-").map(Number);
    if (month >= 1 && month <= 12) {
      return {
        key: period,
        label: `${year}년 ${month}월`,
        dateFilter: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        },
      };
    }
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return {
    key: "current",
    label: `${year}년 ${month}월`,
    dateFilter: {
      gte: new Date(year, month - 1, 1),
      lt: new Date(year, month, 1),
    },
  };
}

export async function getDiscountCodeAnalyticsData(args: {
  academyId: number;
  period?: string | null;
}): Promise<DiscountCodeAnalyticsData> {
  const { academyId, period } = args;
  const prisma = getPrisma();
  const resolvedPeriod = resolveDiscountCodePeriod(period);
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  sevenDaysLater.setHours(23, 59, 59, 999);

  const [codes, usages] = await Promise.all([
    prisma.discountCode.findMany({
      where: applyDiscountCodeAcademyScope({}, academyId),
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        code: true,
        type: true,
        discountType: true,
        discountValue: true,
        maxUsage: true,
        usageCount: true,
        validFrom: true,
        validUntil: true,
        isActive: true,
        createdAt: true,
        staff: { select: { name: true } },
      },
    }),
    prisma.discountCodeUsage.findMany({
      where: applyDiscountCodeUsageAcademyScope(
        resolvedPeriod.dateFilter ? { usedAt: resolvedPeriod.dateFilter } : {},
        academyId,
      ),
      orderBy: { usedAt: "desc" },
      select: {
        id: true,
        codeId: true,
        examNumber: true,
        usedAt: true,
        student: { select: { name: true, phone: true } },
        payment: { select: { discountAmount: true } },
      },
    }),
  ]);

  const codeMap = new Map(codes.map((code) => [code.id, code]));
  const usagesByCode = new Map<number, DiscountCodeUsageRow[]>();
  let totalDiscountAmount = 0;

  for (const usage of usages) {
    const list = usagesByCode.get(usage.codeId) ?? [];
    const row: DiscountCodeUsageRow = {
      id: usage.id,
      codeId: usage.codeId,
      code: codeMap.get(usage.codeId)?.code ?? `#${usage.codeId}`,
      examNumber: usage.examNumber,
      studentName: usage.student.name,
      mobile: usage.student.phone ?? null,
      usedAt: usage.usedAt.toISOString(),
      discountAmount: usage.payment?.discountAmount ?? 0,
    };
    list.push(row);
    usagesByCode.set(usage.codeId, list);
    totalDiscountAmount += row.discountAmount;
  }

  const rows = codes
    .map<DiscountCodeAnalyticsRow>((code) => {
      const periodUsages = usagesByCode.get(code.id) ?? [];
      const periodTotalDiscount = periodUsages.reduce(
        (sum, usage) => sum + usage.discountAmount,
        0,
      );

      return {
        id: code.id,
        code: code.code,
        type: code.type,
        discountType: code.discountType,
        discountValue: code.discountValue,
        maxUsage: code.maxUsage,
        totalUsageCount: code.usageCount,
        periodUsageCount: periodUsages.length,
        periodTotalDiscount,
        validFrom: code.validFrom.toISOString(),
        validUntil: code.validUntil ? code.validUntil.toISOString() : null,
        isActive: code.isActive,
        createdAt: code.createdAt.toISOString(),
      };
    })
    .sort((left, right) => right.periodUsageCount - left.periodUsageCount || left.code.localeCompare(right.code));

  const activeCodes = codes.filter((code) => {
    if (!code.isActive) {
      return false;
    }
    if (!code.validUntil) {
      return true;
    }
    return code.validUntil >= now;
  }).length;

  const expiringSoonCount = codes.filter((code) => {
    if (!code.isActive || !code.validUntil) {
      return false;
    }
    const validUntil = new Date(code.validUntil);
    validUntil.setHours(23, 59, 59, 999);
    return validUntil >= now && validUntil <= sevenDaysLater;
  }).length;

  return {
    period: resolvedPeriod.key,
    periodLabel: resolvedPeriod.label,
    codes: codes.map((code) => ({
      id: code.id,
      code: code.code,
      type: code.type,
      discountType: code.discountType,
      discountValue: code.discountValue,
      maxUsage: code.maxUsage,
      usageCount: code.usageCount,
      validFrom: code.validFrom.toISOString(),
      validUntil: code.validUntil ? code.validUntil.toISOString() : null,
      isActive: code.isActive,
      createdAt: code.createdAt.toISOString(),
      staff: code.staff,
    })),
    rows,
    recentUsages: usages
      .slice(0, 20)
      .map((usage) => ({
        id: usage.id,
        codeId: usage.codeId,
        code: codeMap.get(usage.codeId)?.code ?? `#${usage.codeId}`,
        examNumber: usage.examNumber,
        studentName: usage.student.name,
        mobile: usage.student.phone ?? null,
        usedAt: usage.usedAt.toISOString(),
        discountAmount: usage.payment?.discountAmount ?? 0,
      })),
    summary: {
      totalCodes: codes.length,
      activeCodes,
      usedCodes: rows.filter((row) => row.periodUsageCount > 0).length,
      totalUsageCount: usages.length,
      totalDiscountAmount,
      expiringSoonCount,
    },
  };
}