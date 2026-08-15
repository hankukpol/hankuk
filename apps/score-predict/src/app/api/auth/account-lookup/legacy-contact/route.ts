import { NextResponse } from "next/server";

import {
  isValidAccountLookupInput,
  normalizeAccountLookupName,
  normalizeAccountLookupPhone,
  registerLegacyAccountContact,
} from "@/lib/police/account-lookup";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if ((await getServerTenantType()) !== "police") {
    return NextResponse.json(
      { error: "소방 계정의 아이디는 가입한 휴대전화 번호입니다." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = normalizeAccountLookupName(typeof body.name === "string" ? body.name : "");
  const contactPhone = normalizeAccountLookupPhone(
    typeof body.contactPhone === "string" ? body.contactPhone : ""
  );
  const password = typeof body.password === "string" ? body.password.trim() : "";

  if (!isValidAccountLookupInput(name, contactPhone) || !password) {
    return NextResponse.json(
      { error: "가입한 이름, 새 휴대전화 번호, 기존 비밀번호를 확인해 주세요." },
      { status: 400 }
    );
  }

  const result = await registerLegacyAccountContact({ name, contactPhone, password });
  if (result.status === "contact_exists") {
    return NextResponse.json(
      {
        code: "CONTACT_EXISTS",
        error: "이미 다른 계정에 등록된 연락처입니다. 일반 아이디 찾기를 이용해 주세요.",
      },
      { status: 409 }
    );
  }
  if (result.status === "ambiguous") {
    return NextResponse.json(
      {
        code: "ACCOUNT_AMBIGUOUS",
        error: "계정을 하나로 확인할 수 없습니다. 학원 관리자에게 연락처 등록을 요청해 주세요.",
      },
      { status: 409 }
    );
  }
  if (result.status === "not_found") {
    return NextResponse.json(
      {
        error: "일치하는 기존 회원을 찾을 수 없습니다. 이름과 기존 비밀번호를 확인해 주세요.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    username: result.username,
    message: "연락처를 등록하고 아이디를 확인했습니다.",
  });
}
