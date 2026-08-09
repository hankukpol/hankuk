import { NextResponse } from "next/server";

export const runtime = "nodejs";

function gone() {
  return NextResponse.json(
    {
      error: "경찰·소방 합격예측 계정은 독립 운영되어 통합 포털 로그인을 지원하지 않습니다.",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET() {
  return gone();
}

export async function POST() {
  return gone();
}
