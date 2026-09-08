import { withApiHandler } from "@/lib/api-handler";
import { NextResponse } from "next/server";

import { getCurrentAdminSession, getCurrentStudentSession } from "@/lib/auth";

async function handleGET() {
  const admin = await getCurrentAdminSession();

  if (admin) {
    return NextResponse.json({ kind: "admin", session: admin }, { headers: { "Cache-Control": "private, no-store, no-cache" } });
  }

  const student = await getCurrentStudentSession();

  if (student) {
    return NextResponse.json({ kind: "student", session: student }, { headers: { "Cache-Control": "private, no-store, no-cache" } });
  }

  return NextResponse.json({ error: "인증 정보가 없습니다." }, { status: 401 });
}

export const GET = withApiHandler(handleGET, "인증 정보를 확인하지 못했습니다.");
