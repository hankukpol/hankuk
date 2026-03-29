import { NextResponse } from "next/server";
import { getActiveNotices, getSiteSettingsUncached } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSiteSettingsUncached();
    const noticesEnabled = Boolean(settings["site.tabNoticesEnabled"] ?? true);

    if (!noticesEnabled) {
      return NextResponse.json({ notices: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const notices = await getActiveNotices();
    return NextResponse.json(
      { notices },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("공개 공지 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "공지 조회에 실패했습니다." }, { status: 500 });
  }
}
