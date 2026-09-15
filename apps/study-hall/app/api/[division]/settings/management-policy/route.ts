import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { getAcademyPolicySettings, saveAcademyPolicySettings } from "@/lib/services/academy-policy-settings.service";

export async function GET(_request: NextRequest, { params }: { params: { division: string } }) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try { return NextResponse.json(await getAcademyPolicySettings(params.division), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return toApiErrorResponse(error, "학원 규정을 불러오지 못했습니다."); }
}
export async function PUT(request: NextRequest, { params }: { params: { division: string } }) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.text();
    if (body.length > 150000) return NextResponse.json({ error: "설정 내용이 너무 큽니다." }, { status: 400 });
    return NextResponse.json(await saveAcademyPolicySettings(params.division, JSON.parse(body), auth.session));
  } catch (error) { return toApiErrorResponse(error, "학원 규정을 저장하지 못했습니다."); }
}
