import { notFound } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { examTypeReorderSchema, examTypeSchema } from "@/lib/exam-schemas";
import { listExamTypes, reorderExamTypes } from "@/lib/services/exam.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { division: string; id: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "examManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (body && typeof body === "object" && "reorderIds" in body) {
    const reorderParsed = examTypeReorderSchema.safeParse(body);

    if (!reorderParsed.success) {
      return NextResponse.json(
        { error: getZodErrorMessage(reorderParsed.error, "시험 템플릿 목록을 다시 확인해주세요.") },
        { status: 400 },
      );
    }

    try {
      const examTypes = await reorderExamTypes(params.division, reorderParsed.data.reorderIds);
      return NextResponse.json({ examTypes });
    } catch (error) {
      return toApiErrorResponse(error, "시험 템플릿 처리 중 오류가 발생했습니다.");
    }
  }

  const parsed = examTypeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "시험 템플릿 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const { applyAcademyConfigurationEdit } = await import("@/lib/services/academy-template.service");
    const { editAcademyExam } = await import("@/lib/academy-exam-edit");
    await applyAcademyConfigurationEdit(params.division,"시험 종류 변경",current=>editAcademyExam(current,params.id,parsed.data),auth.session);
    const examType=(await listExamTypes(params.division)).find(e=>e.id===params.id);
    revalidateTag(`exam-analysis:${params.division}`);
    return NextResponse.json({ examType });
  } catch (error) {
    return toApiErrorResponse(error, "시험 템플릿 처리 중 오류가 발생했습니다.");
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

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "examManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const { applyAcademyConfigurationEdit } = await import("@/lib/services/academy-template.service");
    await applyAcademyConfigurationEdit(params.division,"시험 종류 비활성화",current=>{
      if(!current.examTypes.some(e=>e.id===params.id))throw notFound("시험 종류를 찾을 수 없습니다.");
      return {...current,examTypes:current.examTypes.map(e=>e.id===params.id?{...e,isActive:false}:e)};
    },auth.session);
    revalidateTag(`exam-analysis:${params.division}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, "시험 템플릿 처리 중 오류가 발생했습니다.");
  }
}
