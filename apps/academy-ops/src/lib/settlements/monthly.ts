import { PaymentStatus, RefundStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type MonthlyCategoryStat = {
  count: number;
  gross: number;
  refund: number;
  net: number;
};

export type MonthlyMethodStat = {
  count: number;
  amount: number;
};

export type MonthlySummary = {
  tuition: MonthlyCategoryStat;
  facility: MonthlyCategoryStat;
  textbook: MonthlyCategoryStat;
  material: MonthlyCategoryStat;
  singleCourse: MonthlyCategoryStat;
  penalty: MonthlyCategoryStat;
  etc: MonthlyCategoryStat;
  totalCount: number;
  grossTotal: number;
  refundTotal: number;
  netTotal: number;
};

export type MonthlyMethods = {
  cash: MonthlyMethodStat;
  card: MonthlyMethodStat;
  transfer: MonthlyMethodStat;
  point: MonthlyMethodStat;
  mixed: MonthlyMethodStat;
};

export type DailyEntry = {
  date: string;
  count: number;
  gross: number;
  refund: number;
  net: number;
};

export type MonthlySettlementData = {
  month: string;
  summary: MonthlySummary;
  methods: MonthlyMethods;
  dailyBreakdown: DailyEntry[];
};

type CategoryCode =
  | "TUITION"
  | "FACILITY"
  | "TEXTBOOK"
  | "MATERIAL"
  | "SINGLE_COURSE"
  | "PENALTY"
  | "ETC";

type MethodCode = "CASH" | "CARD" | "TRANSFER" | "POINT" | "MIXED";

const PAID_STATUSES: PaymentStatus[] = ["APPROVED", "PARTIAL_REFUNDED"];
const COUNTED_REFUND_STATUSES: RefundStatus[] = ["APPROVED", "COMPLETED"];

const CATEGORY_CODES: Array<{
  code: CategoryCode;
  key: keyof Omit<MonthlySummary, "totalCount" | "grossTotal" | "refundTotal" | "netTotal">;
}> = [
  { code: "TUITION", key: "tuition" },
  { code: "FACILITY", key: "facility" },
  { code: "TEXTBOOK", key: "textbook" },
  { code: "MATERIAL", key: "material" },
  { code: "SINGLE_COURSE", key: "singleCourse" },
  { code: "PENALTY", key: "penalty" },
  { code: "ETC", key: "etc" },
];

const METHOD_CODES: Array<{
  code: MethodCode;
  key: keyof MonthlyMethods;
}> = [
  { code: "CASH", key: "cash" },
  { code: "CARD", key: "card" },
  { code: "TRANSFER", key: "transfer" },
  { code: "POINT", key: "point" },
  { code: "MIXED", key: "mixed" },
];

export function parseMonthParam(param: string | null | undefined): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [year, month] = param.split("-").map(Number);
    if (month >= 1 && month <= 12) {
      return { year, month };
    }
  }

  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export async function getMonthlySettlementData(
  monthParam: string | null | undefined,
): Promise<MonthlySettlementData> {
  const { year, month } = parseMonthParam(monthParam);
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const [allPayments, allRefunds] = await getPrisma().$transaction([
    getPrisma().payment.findMany({
      where: {
        status: { in: PAID_STATUSES },
        processedAt: { gte: startOfMonth, lte: endOfMonth },
      },
      select: {
        id: true,
        category: true,
        method: true,
        grossAmount: true,
        processedAt: true,
      },
    }),
    getPrisma().refund.findMany({
      where: {
        status: { in: COUNTED_REFUND_STATUSES },
        processedAt: { gte: startOfMonth, lte: endOfMonth },
      },
      select: {
        amount: true,
        processedAt: true,
        payment: {
          select: {
            category: true,
          },
        },
      },
    }),
  ]);

  const categoryMap: Record<CategoryCode, { count: number; gross: number; refund: number }> = {
    TUITION: { count: 0, gross: 0, refund: 0 },
    FACILITY: { count: 0, gross: 0, refund: 0 },
    TEXTBOOK: { count: 0, gross: 0, refund: 0 },
    MATERIAL: { count: 0, gross: 0, refund: 0 },
    SINGLE_COURSE: { count: 0, gross: 0, refund: 0 },
    PENALTY: { count: 0, gross: 0, refund: 0 },
    ETC: { count: 0, gross: 0, refund: 0 },
  };

  const methodMap: Record<MethodCode, MonthlyMethodStat> = {
    CASH: { count: 0, amount: 0 },
    CARD: { count: 0, amount: 0 },
    TRANSFER: { count: 0, amount: 0 },
    POINT: { count: 0, amount: 0 },
    MIXED: { count: 0, amount: 0 },
  };

  for (const payment of allPayments) {
    const category = payment.category as CategoryCode;
    const method = payment.method as MethodCode;

    categoryMap[category].count += 1;
    categoryMap[category].gross += payment.grossAmount;
    methodMap[method].count += 1;
    methodMap[method].amount += payment.grossAmount;
  }

  for (const refund of allRefunds) {
    const category = refund.payment.category as CategoryCode;
    categoryMap[category].refund += refund.amount;
  }

  const grossTotal = allPayments.reduce((sum, payment) => sum + payment.grossAmount, 0);
  const refundTotal = allRefunds.reduce((sum, refund) => sum + refund.amount, 0);
  const totalCount = allPayments.length;
  const netTotal = grossTotal - refundTotal;

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyBreakdown: DailyEntry[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

    const dayPayments = allPayments.filter((payment) => {
      const time = new Date(payment.processedAt).getTime();
      return time >= dayStart && time <= dayEnd;
    });

    const dayRefunds = allRefunds.filter((refund) => {
      const time = new Date(refund.processedAt).getTime();
      return time >= dayStart && time <= dayEnd;
    });

    const dayGross = dayPayments.reduce((sum, payment) => sum + payment.grossAmount, 0);
    const dayRefund = dayRefunds.reduce((sum, refund) => sum + refund.amount, 0);
    const dayNet = dayGross - dayRefund;

    if (dayPayments.length > 0 || dayRefund > 0) {
      dailyBreakdown.push({
        date: `${monthStr}-${String(day).padStart(2, "0")}`,
        count: dayPayments.length,
        gross: dayGross,
        refund: dayRefund,
        net: dayNet,
      });
    }
  }

  const summary = Object.fromEntries(
    CATEGORY_CODES.map(({ code, key }) => {
      const stat = categoryMap[code];
      return [
        key,
        {
          count: stat.count,
          gross: stat.gross,
          refund: stat.refund,
          net: stat.gross - stat.refund,
        },
      ];
    }),
  ) as Omit<MonthlySummary, "totalCount" | "grossTotal" | "refundTotal" | "netTotal">;

  const methods = Object.fromEntries(
    METHOD_CODES.map(({ code, key }) => [key, methodMap[code]]),
  ) as MonthlyMethods;

  return {
    month: monthStr,
    summary: {
      ...summary,
      totalCount,
      grossTotal,
      refundTotal,
      netTotal,
    },
    methods,
    dailyBreakdown,
  };
}
