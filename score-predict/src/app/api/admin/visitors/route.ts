import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function toCount(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("visitors");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(7, Number(searchParams.get("days") ?? "14")));

  try {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const fromDate = new Date(todayUTC);
    fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));

    // 기간 내 일별 방문자 수
    const visitorRows = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT date::date AS date, COUNT(*)::bigint AS count
      FROM visitor_logs
      WHERE date >= ${fromDate} AND date <= ${todayUTC}
      GROUP BY date::date
      ORDER BY date::date ASC
    `;

    // 기간 내 일별 신규 가입자 수
    const newUserRows = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT "createdAt"::date AS date, COUNT(*)::bigint AS count
      FROM "User"
      WHERE "createdAt" >= ${fromDate}
      GROUP BY "createdAt"::date
      ORDER BY "createdAt"::date ASC
    `;

    // 기간 내 일별 제출자 수
    const submissionRows = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT "createdAt"::date AS date, COUNT(*)::bigint AS count
      FROM "Submission"
      WHERE "createdAt" >= ${fromDate}
      GROUP BY "createdAt"::date
      ORDER BY "createdAt"::date ASC
    `;

    // 날짜 범위 배열 생성 (days일치 보장)
    const dateRange: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(fromDate);
      d.setUTCDate(d.getUTCDate() + i);
      dateRange.push(d.toISOString().slice(0, 10));
    }

    const visitorMap = new Map(visitorRows.map((r) => [r.date.toISOString().slice(0, 10), toCount(r.count)]));
    const newUserMap = new Map(newUserRows.map((r) => [r.date.toISOString().slice(0, 10), toCount(r.count)]));
    const submissionMap = new Map(submissionRows.map((r) => [r.date.toISOString().slice(0, 10), toCount(r.count)]));

    const daily = dateRange.map((date) => ({
      date,
      visitors: visitorMap.get(date) ?? 0,
      newUsers: newUserMap.get(date) ?? 0,
      submissions: submissionMap.get(date) ?? 0,
    }));

    const todayStr = todayUTC.toISOString().slice(0, 10);
    const todayRow = daily.find((r) => r.date === todayStr);

    // 전체 누적 방문자 (로그인 + 비회원 합산)
    const [loggedInVisitors, anonVisitors] = await Promise.all([
      prisma.visitorLog
        .groupBy({ by: ["userId"], where: { userId: { not: null } } })
        .then((rows) => rows.length),
      prisma.visitorLog
        .groupBy({ by: ["anonymousId"], where: { anonymousId: { not: null } } })
        .then((rows) => rows.length),
    ]);
    const totalUniqueVisitors = loggedInVisitors + anonVisitors;

    // 전체 누적 가입자
    const totalUsers = await prisma.user.count();

    return NextResponse.json({
      today: {
        visitors: todayRow?.visitors ?? 0,
        newUsers: todayRow?.newUsers ?? 0,
        submissions: todayRow?.submissions ?? 0,
      },
      totals: {
        uniqueVisitors: totalUniqueVisitors,
        users: totalUsers,
      },
      daily,
    });
  } catch (error) {
    console.error("방문자 통계 조회 오류:", error);
    return NextResponse.json({ error: "방문자 통계 조회에 실패했습니다." }, { status: 500 });
  }
}
