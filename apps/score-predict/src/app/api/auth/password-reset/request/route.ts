import { NextResponse } from "next/server";
import { requestPasswordResetCode } from "@/lib/police/password-reset";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const tenantType = await getServerTenantType();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await requestPasswordResetCode(body, tenantType, request);
  return NextResponse.json(result.body, { status: result.status });
}
