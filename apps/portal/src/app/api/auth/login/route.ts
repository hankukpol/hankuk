import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signPortalSession, portalCookieOptions, PORTAL_SESSION_COOKIE } from "@/lib/portal-session";
import { createAnonSupabaseClient } from "@/lib/supabase";

const loginSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." },
      { status: 400 },
    );
  }

  const supabase = createAnonSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return NextResponse.json(
      { error: "이메일 또는 비밀번호를 확인해 주세요." },
      { status: 401 },
    );
  }

  const token = await signPortalSession({
    userId: data.user.id,
    email: data.user.email ?? parsed.data.email,
    fullName:
      typeof data.user.user_metadata?.full_name === "string"
        ? data.user.user_metadata.full_name
        : null,
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set(PORTAL_SESSION_COOKIE, token, portalCookieOptions());
  return response;
}
