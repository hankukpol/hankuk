import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { getManagementPolicy, saveOptionalEnrollment, endOptionalEnrollment } from "@/lib/services/management-policy.service";
import { managementPolicySchema, kstDate } from "@/lib/management-policy";
import { previewPolicyAttendance, confirmPolicyAttendance } from "@/lib/services/policy-attendance.service";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll"), enrollment: managementPolicySchema.shape.optionalEnrollments.element }),
  z.object({ action: z.literal("end-enrollment"), enrollment: managementPolicySchema.shape.optionalEnrollments.element }),
  z.object({ action: z.literal("confirm-attendance"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);

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
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "입력한 날짜·학생·교시를 확인해 주세요." }, { status: 400 });
    const input = parsed.data;
    const disabled = await getDivisionFeatureDisabledError(params.division, input.action === "confirm-attendance" ? "pointManagement" : "attendanceManagement");
    if (disabled) return NextResponse.json({ error: disabled }, { status: 403 });
    if (input.action === "enroll") {
      await saveOptionalEnrollment(params.division, input.enrollment);
      return NextResponse.json({ ok: true });
    }
    if (input.action === "end-enrollment") {
      await endOptionalEnrollment(params.division, input.enrollment);
      return NextResponse.json({ ok: true });
    }
    const result = await confirmPolicyAttendance(params.division, input.date, auth.session.id);
    return NextResponse.json(result);
  } catch (error) { return toApiErrorResponse(error, "관리규정을 반영하지 못했습니다."); }
}
