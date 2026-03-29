import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { normalizeYmMonth, normalizeYmdDate } from "@/lib/date-utils";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import {
  getMonthlyExportRows,
  getPaymentExportRows,
  getPointExportRows,
  getReportData,
  resolveReportSelection,
} from "@/lib/services/report.service";

const reportTypeSchema = z.enum(["attendance", "points", "monthly", "payments"]);

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeDate(value?: string | null) {
  return value ? normalizeYmdDate(value, "date") : getKstToday();
}

function normalizeMonth(value?: string | null) {
  return value ? normalizeYmMonth(value) : getKstToday().slice(0, 7);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string; type: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const reportingDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "reporting",
  );

  if (reportingDisabledError) {
    return NextResponse.json({ error: reportingDisabledError }, { status: 403 });
  }

  const parsedType = reportTypeSchema.safeParse(params.type);

  if (!parsedType.success) {
    return NextResponse.json(
      { error: "지원하지 않는 보고서 유형입니다." },
      { status: 404 },
    );
  }

  const relatedFeatureKey =
    parsedType.data === "attendance"
      ? "attendanceManagement"
      : parsedType.data === "points"
        ? "pointManagement"
        : parsedType.data === "payments"
          ? "paymentManagement"
          : null;

  if (relatedFeatureKey) {
    const relatedFeatureDisabledError = await getDivisionFeatureDisabledError(
      params.division,
      relatedFeatureKey,
    );

    if (relatedFeatureDisabledError) {
      return NextResponse.json(
        { error: relatedFeatureDisabledError },
        { status: 403 },
      );
    }
  }

  try {
    if (parsedType.data === "attendance") {
      const period = request.nextUrl.searchParams.get("period") ?? undefined;
      const date = request.nextUrl.searchParams.get("date") ?? undefined;
      const month = request.nextUrl.searchParams.get("month") ?? undefined;
      const report = await getReportData(
        params.division,
        resolveReportSelection({ period, date, month }),
      );

      return NextResponse.json(
        { type: parsedType.data, report },
        {
          headers: { "Cache-Control": "max-age=30, stale-while-revalidate=15" },
        },
      );
    }

    if (parsedType.data === "monthly") {
      const month = normalizeMonth(request.nextUrl.searchParams.get("month"));
      const rows = await getMonthlyExportRows(params.division, month);

      return NextResponse.json(
        { type: parsedType.data, month, rows },
        {
          headers: { "Cache-Control": "max-age=30, stale-while-revalidate=15" },
        },
      );
    }

    const dateFrom = normalizeDate(request.nextUrl.searchParams.get("dateFrom"));
    const dateTo = normalizeDate(request.nextUrl.searchParams.get("dateTo"));

    if (parsedType.data === "points") {
      const rows = await getPointExportRows(params.division, dateFrom, dateTo);

      return NextResponse.json(
        { type: parsedType.data, dateFrom, dateTo, rows },
        {
          headers: { "Cache-Control": "max-age=30, stale-while-revalidate=15" },
        },
      );
    }

    const rows = await getPaymentExportRows(params.division, dateFrom, dateTo);

    return NextResponse.json(
      { type: parsedType.data, dateFrom, dateTo, rows },
      {
        headers: { "Cache-Control": "max-age=30, stale-while-revalidate=15" },
      },
    );
  } catch (error) {
    return toApiErrorResponse(
      error,
      "보고서 데이터를 불러오는 중 오류가 발생했습니다.",
    );
  }
}
