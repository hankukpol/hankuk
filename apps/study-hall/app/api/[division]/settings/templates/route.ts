import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { badRequest } from "@/lib/errors";
import { kstDate } from "@/lib/management-policy";
import { commonAcademyTemplate } from "@/lib/academy-template-presets";
import { correctAcademyApplicationDate, getAcademyApplicationDateCorrections } from "@/lib/services/academy-application-date.service";
import { getAcademyTemplateLibrary, saveAcademyTemplate, previewAcademyTemplate, applyAcademyTemplate, cancelAcademyTemplateApplication, applyDueAcademyTemplates, getAcademyTemplateApplication } from "@/lib/services/academy-template.service";
export const dynamic = "force-dynamic";
type Context = { params: { division: string } };
export async function GET(_request: NextRequest, { params }: Context) {
  const auth = await requireApiAuth(params.division);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    await applyDueAcademyTemplates(params.division);
    return NextResponse.json({ ...await getAcademyTemplateLibrary(params.division), common: commonAcademyTemplate(kstDate()), blank: commonAcademyTemplate(kstDate(), true), today: kstDate() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return toApiErrorResponse(error, "템플릿을 불러오지 못했습니다."); }
}
export async function POST(request: NextRequest, { params }: Context) {
  const auth = await requireApiAuth(params.division);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const text = await request.text();
    if (text.length > 1500000) throw badRequest("템플릿 파일은 1.5MB 이내로 입력해 주세요.");
    let body;
    try { body = JSON.parse(text); } catch { throw badRequest("올바른 JSON 파일을 입력해 주세요."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("요청 형식을 확인해 주세요.");
    const actor = { id: auth.session.id, name: auth.session.name };
    let result: unknown;
    if (body.action === "date-preview") result = await correctAcademyApplicationDate(params.division, body.value, actor);
    else if (body.action === "date-apply") result = await correctAcademyApplicationDate(params.division, body.value, actor, true);
    else if (body.action === "date-history") result = await getAcademyApplicationDateCorrections(params.division);
    else if (body.action === "save") result = await saveAcademyTemplate(params.division, body.value, actor);
    else if (body.action === "preview") result = await previewAcademyTemplate(params.division, body.value);
    else if (body.action === "apply") result = await applyAcademyTemplate(params.division, body.value, actor);
    else if (body.action === "history" && typeof body.id === "string") result = await getAcademyTemplateApplication(params.division, body.id);
    else if (body.action === "cancel" && typeof body.id === "string") { await cancelAcademyTemplateApplication(params.division, body.id); result = { ok: true }; }
    else throw badRequest("지원하지 않는 요청입니다.");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return toApiErrorResponse(error, "템플릿 요청을 처리하지 못했습니다."); }
}
