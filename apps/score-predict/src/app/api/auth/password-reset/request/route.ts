import { NextResponse } from "next/server";
import { requestPasswordResetCode } from "@/lib/police/password-reset";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const tenantType = await getServerTenantType();

  if (tenantType !== "police") {
    return NextResponse.json(
      {
        error: "이메일 재설정은 비활성화되어 있습니다. 복구코드로 비밀번호를 재설정해 주세요.",
      },
      { status: 410 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await requestPasswordResetCode(body, request);
  return NextResponse.json(result.body, { status: result.status });
}
