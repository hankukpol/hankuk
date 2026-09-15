import { NextRequest, NextResponse } from "next/server";
import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { divisionSettingsCopySchema } from "@/lib/super-admin-schemas";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { getAcademyTemplateLibrary, saveAcademyTemplate } from "@/lib/services/academy-template.service";

/** Initial academy setup copies a draft. Its administrator previews and applies it. */
export async function POST(request: NextRequest) {
  const auth = await requireApiSuperAdminAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = divisionSettingsCopySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.sourceSlug === parsed.data.targetSlug)
    return NextResponse.json({ error: "서로 다른 원본·대상 학원을 선택해 주세요." }, { status: 400 });
  try {
    const { current } = await getAcademyTemplateLibrary(parsed.data.sourceSlug);
    const saved = await saveAcademyTemplate(parsed.data.targetSlug, { name: "가져온 학원 운영 템플릿", payload: current }, auth.session);
    return NextResponse.json({ ok: true, templateId: saved.id, requiresApply: true, periodsCount: current.periods.length, rulesCount: current.pointRules.length });
  } catch (error) { return toApiErrorResponse(error, "학원 템플릿 복사에 실패했습니다."); }
}
