import { NextResponse } from "next/server";
import { getEffectiveSiteSettings } from "@/lib/exam-operation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 답안 입력·사전등록처럼 시험 당일 즉시 반영되어야 하는 운영 토글이
    // 포함되므로 이 공개 API에서는 서버 캐시를 사용하지 않는다.
    const settings = await getEffectiveSiteSettings();
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
