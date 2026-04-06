import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { createPeriod, getPeriods } from "@/lib/services/period.service";

const periodSchema = z.object({
  name: z.string().min(1, "교시 이름을 입력해 주세요."),
  label: z.string().nullable().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "시작 시간 형식이 올바르지 않습니다."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "종료 시간 형식이 올바르지 않습니다."),
  isMandatory: z.boolean(),
  isActive: z.boolean(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const periods = await getPeriods(params.division);
    return NextResponse.json(
      { periods },
      {
        headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" },
      },
    );
  } catch (error) {
    return toApiErrorResponse(error, "교시 목록을 불러오지 못했습니다.");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = periodSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "교시 정보를 다시 확인해 주세요.") },
      { status: 400 },
    );
  }

  try {
    const period = await createPeriod(params.division, parsed.data);
    return NextResponse.json({ period }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "교시 생성에 실패했습니다.");
  }
}
