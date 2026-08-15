import { NextResponse } from "next/server";

import {
  findAccountsForLookup,
  isValidAccountLookupInput,
  normalizeAccountLookupName,
  normalizeAccountLookupPhone,
} from "@/lib/police/account-lookup";
import { resolvePreferredPoliceUsername } from "@/lib/police/account-identity";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if ((await getServerTenantType()) !== "police") {
    return NextResponse.json({ error: "소방 계정의 아이디는 가입한 휴대전화 번호입니다." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = normalizeAccountLookupName(typeof body.name === "string" ? body.name : "");
  const contactPhone = normalizeAccountLookupPhone(
    typeof body.contactPhone === "string" ? body.contactPhone : ""
  );
  if (!isValidAccountLookupInput(name, contactPhone)) {
    return NextResponse.json({ error: "가입한 이름과 휴대전화 번호를 확인해 주세요." }, { status: 400 });
  }

  const users = await findAccountsForLookup(name, contactPhone);
  if (users.length === 0) {
    return NextResponse.json(
      { error: "일치하는 회원 정보를 찾을 수 없습니다. 이름과 휴대전화를 확인해 주세요." },
      { status: 404 }
    );
  }

  const usernames = Array.from(
    new Set(users.map((user) => resolvePreferredPoliceUsername(user)))
  );

  return NextResponse.json({
    success: true,
    username: usernames[0],
    usernames,
    message:
      usernames.length > 1
        ? "같은 회원 정보로 가입된 아이디를 모두 확인했습니다."
        : "회원 정보를 확인했습니다.",
  });
}
