import { NextRequest, NextResponse } from "next/server";

import { isValidUsername, normalizeUsername } from "@/lib/police/validations";
import { getServerTenantType } from "@/lib/tenant.server";
import { findPoliceUsersByUsername } from "@/lib/police/account-identity";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if ((await getServerTenantType()) !== "police") {
    return NextResponse.json({ error: "경찰 회원 아이디에서만 사용할 수 있습니다." }, { status: 404 });
  }

  const username = normalizeUsername(request.nextUrl.searchParams.get("username") ?? "");
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { available: false, error: "아이디는 영문, 숫자, 밑줄(_), 하이픈(-)을 사용해 4~20자로 입력해 주세요." },
      { status: 400 }
    );
  }

  const duplicate = (await findPoliceUsersByUsername(username))[0];

  return NextResponse.json(
    {
      available: !duplicate,
      username,
      message: duplicate ? "이미 사용 중인 아이디입니다." : "사용할 수 있는 아이디입니다.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
