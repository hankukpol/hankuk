import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { deletePeriod, updatePeriod } from "@/lib/services/period.service";

const updatePeriodSchema = z.object({
  name: z.string().min(1).optional(),
  label: z.string().nullable().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isMandatory: z.boolean().optional(),
  isActive: z.boolean().optional(),
  reorderIds: z.array(z.string()).min(1).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { division: string; id: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = updatePeriodSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "교시 정보를 다시 확인해 주세요.") },
      { status: 400 },
    );
  }

  try {
    const result = await updatePeriod(params.division, params.id, parsed.data);
    return NextResponse.json({ result });
  } catch (error) {
    return toApiErrorResponse(error, "교시 수정에 실패했습니다.");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { division: string; id: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const periods = await deletePeriod(params.division, params.id);
    return NextResponse.json({ periods });
  } catch (error) {
    return toApiErrorResponse(error, "교시 삭제에 실패했습니다.");
  }
}
