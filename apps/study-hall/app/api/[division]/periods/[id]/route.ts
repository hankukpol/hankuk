import { notFound } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getPeriods, updatePeriod } from "@/lib/services/period.service";

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
    let result;
    if (parsed.data.reorderIds) result = await updatePeriod(params.division,params.id,{reorderIds:parsed.data.reorderIds});
    else {
      const { applyAcademyConfigurationEdit } = await import("@/lib/services/academy-template.service");
      await applyAcademyConfigurationEdit(params.division,"교시 변경",current=>{
        if(!current.periods.some(p=>p.id===params.id)) throw notFound("교시를 찾을 수 없습니다.");
        return {...current,periods:current.periods.map(p=>p.id===params.id?{...p,...parsed.data}:p)};
      },auth.session);
      result=(await getPeriods(params.division)).find(p=>p.id===params.id);
    }
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
    const { applyAcademyConfigurationEdit } = await import("@/lib/services/academy-template.service");
    await applyAcademyConfigurationEdit(params.division,"교시 비활성화",current=>{
      if(!current.periods.some(p=>p.id===params.id))throw notFound("교시를 찾을 수 없습니다.");
      return {...current,periods:current.periods.map(p=>p.id===params.id?{...p,isActive:false}:p)};
    },auth.session);
    const periods=await getPeriods(params.division);
    return NextResponse.json({ periods });
  } catch (error) {
    return toApiErrorResponse(error, "교시 삭제에 실패했습니다.");
  }
}
