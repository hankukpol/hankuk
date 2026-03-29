import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const prisma = getPrisma();

  // Target: yesterday (KST midnight → midnight range)
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(todayStart); // exclusive upper bound

  // Fetch all APPROVED/PARTIAL_REFUNDED payments for yesterday
  const payments = await prisma.payment.findMany({
    where: {
      status: { in: ["APPROVED", "PARTIAL_REFUNDED", "FULLY_REFUNDED"] },
      processedAt: {
        gte: yesterdayStart,
        lt: yesterdayEnd,
      },
    },
    select: {
      category: true,
      method: true,
      netAmount: true,
    },
  });

  // Fetch completed refunds for yesterday
  const refunds = await prisma.refund.findMany({
    where: {
      status: "COMPLETED",
      processedAt: {
        gte: yesterdayStart,
        lt: yesterdayEnd,
      },
    },
    select: {
      amount: true,
    },
  });

  // Aggregate totals by category
  let tuitionTotal = 0;
  let facilityTotal = 0;
  let textbookTotal = 0;
  let posTotal = 0;
  let etcTotal = 0;

  let cashAmount = 0;
  let cardAmount = 0;
  let transferAmount = 0;

  for (const p of payments) {
    const amount = p.netAmount;

    switch (p.category) {
      case "TUITION":
        tuitionTotal += amount;
        break;
      case "FACILITY":
        facilityTotal += amount;
        break;
      case "TEXTBOOK":
      case "MATERIAL":
        textbookTotal += amount;
        break;
      case "SINGLE_COURSE":
        posTotal += amount;
        break;
      default:
        etcTotal += amount;
        break;
    }

    switch (p.method) {
      case "CASH":
        cashAmount += amount;
        break;
      case "CARD":
        cardAmount += amount;
        break;
      case "TRANSFER":
        transferAmount += amount;
        break;
      default:
        // POINT / MIXED — count toward gross but not broken out separately
        break;
    }
  }

  const grossTotal = tuitionTotal + facilityTotal + textbookTotal + posTotal + etcTotal;
  const refundTotal = refunds.reduce((sum, r) => sum + r.amount, 0);
  const netTotal = grossTotal - refundTotal;

  // Upsert DailySettlement for yesterday
  const dateOnly = new Date(yesterdayStart);
  dateOnly.setUTCHours(0, 0, 0, 0);

  await prisma.dailySettlement.upsert({
    where: { date: dateOnly },
    create: {
      date: dateOnly,
      tuitionTotal,
      facilityTotal,
      textbookTotal,
      posTotal,
      etcTotal,
      grossTotal,
      refundTotal,
      netTotal,
      cashAmount,
      cardAmount,
      transferAmount,
    },
    update: {
      tuitionTotal,
      facilityTotal,
      textbookTotal,
      posTotal,
      etcTotal,
      grossTotal,
      refundTotal,
      netTotal,
      cashAmount,
      cardAmount,
      transferAmount,
    },
  });

  console.log(
    `[daily-settlement] date=${yesterdayStart.toISOString().slice(0, 10)} gross=${grossTotal} refund=${refundTotal} net=${netTotal}`,
  );

  return NextResponse.json({
    date: yesterdayStart.toISOString().slice(0, 10),
    tuitionTotal,
    facilityTotal,
    textbookTotal,
    posTotal,
    etcTotal,
    grossTotal,
    refundTotal,
    netTotal,
    cashAmount,
    cardAmount,
    transferAmount,
  });
}
