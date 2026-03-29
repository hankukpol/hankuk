import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/site-settings";

export const runtime = "nodejs";

/** 비인증 public 엔드포인트 — 회원가입 전 약관 내용 제공 */
export async function GET() {
  const settings = await getSiteSettings();

  return NextResponse.json({
    termsOfService: String(settings["site.termsOfService"] ?? ""),
    privacyPolicy: String(settings["site.privacyPolicy"] ?? ""),
  });
}