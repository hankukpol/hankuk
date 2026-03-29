import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSiteSettings();
    return NextResponse.json(
      { settings },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("공개 사이트 설정 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사이트 설정 조회에 실패했습니다." }, { status: 500 });
  }
}
