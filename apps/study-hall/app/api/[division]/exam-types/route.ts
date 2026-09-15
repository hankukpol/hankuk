import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { examTypeSchema } from "@/lib/exam-schemas";
import { listExamTypes } from "@/lib/services/exam.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { division: string } },
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
    const examTypes = await listExamTypes(params.division);
    return NextResponse.json({ examTypes }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" } });
  } catch (error) {
    return toApiErrorResponse(error, "시험 템플릿 처리 중 오류가 발생했습니다.");
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

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "examManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
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
    const config=await applyAcademyConfigurationEdit(params.division,"시험 종류 추가",current=>editAcademyExam(current,null,parsed.data),auth.session);
    const examType=(await listExamTypes(params.division)).find(e=>e.id===config.examTypes.find(e=>e.name===parsed.data.name&&e.category===parsed.data.category)?.id);
    revalidateTag(`exam-analysis:${params.division}`);
    return NextResponse.json({ examType }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "시험 템플릿 처리 중 오류가 발생했습니다.");
  }
}
