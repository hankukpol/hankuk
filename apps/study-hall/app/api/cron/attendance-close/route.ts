import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { closeAllAttendance } from "@/lib/services/attendance-close.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!request.headers.get("authorization")) return NextResponse.json({error:"인증이 필요합니다."}, {status:401});
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({error:"자동 마감 인증이 설정되지 않았습니다."}, {status:503});
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({error:"인증이 필요합니다."}, {status:401});
  try {
    const results = await closeAllAttendance();
    const incomplete = results.some(row=>row.failed || row.pending);
    return NextResponse.json({results}, {status: incomplete ? 503 : 200, headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"출결 자동 마감에 실패했습니다. 다시 실행해 주세요."}, {status:503});
  }
}
