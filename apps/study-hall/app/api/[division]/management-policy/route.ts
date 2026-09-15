import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { kstDate } from "@/lib/management-policy";
import { previewPolicyAttendance, confirmPolicyAttendance } from "@/lib/services/policy-attendance.service";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";

const actionSchema = z.object({ action: z.literal("confirm-attendance"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function GET(request: NextRequest, { params }: { params: { division: string } }) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN", "ASSISTANT"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const date = request.nextUrl.searchParams.get("date") ?? kstDate();
    const [policy, candidates] = await Promise.all([getManagementPolicy(params.division), previewPolicyAttendance(params.division, date)]);
    return NextResponse.json({ policy, candidates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return toApiErrorResponse(error, "관리규정을 불러오지 못했습니다."); }
}

export async function POST(request: NextRequest, { params }: { params: { division: string } }) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json().catch(() => null);
    if (body?.action === "enroll" || body?.action === "end-enrollment") {
      return NextResponse.json({ error: "더 이상 제공하지 않는 기능입니다. 교시별 출결 설정을 확인해 주세요." }, { status: 410 });
    }
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "입력한 날짜·학생·교시를 확인해 주세요." }, { status: 400 });
    const input = parsed.data;
    const disabled = await getDivisionFeatureDisabledError(params.division, "pointManagement");
    if (disabled) return NextResponse.json({ error: disabled }, { status: 403 });
    const result = await confirmPolicyAttendance(params.division, input.date, auth.session.id);
    return NextResponse.json(result);
  } catch (error) { return toApiErrorResponse(error, "관리규정을 반영하지 못했습니다."); }
}
