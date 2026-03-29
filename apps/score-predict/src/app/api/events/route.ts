import { NextResponse } from "next/server";
import { getActiveEvents } from "@/lib/events";

export const runtime = "nodejs";

export async function GET() {
  try {
    const events = await getActiveEvents();
    return NextResponse.json(
      { events },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("공개 이벤트 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "이벤트 조회에 실패했습니다." }, { status: 500 });
  }
}
