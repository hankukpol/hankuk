import { NextResponse } from "next/server";
import { getActiveBanners } from "@/lib/banners";

export const runtime = "nodejs";

export async function GET() {
  try {
    const banners = await getActiveBanners();
    return NextResponse.json(
      { banners },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("공개 배너 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "배너 조회에 실패했습니다." }, { status: 500 });
  }
}
