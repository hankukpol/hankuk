import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { examTypeReorderSchema, examTypeSchema } from "@/lib/exam-schemas";
import { deleteExamType, reorderExamTypes, updateExamType } from "@/lib/services/exam.service";

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
    const examType = await updateExamType(params.division, params.id, parsed.data);
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
    await deleteExamType(params.division, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, "시험 템플릿 처리 중 오류가 발생했습니다.");
  }
}
