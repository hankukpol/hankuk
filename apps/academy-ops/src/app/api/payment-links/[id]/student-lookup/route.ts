/**
 * GET /api/payment-links/[id]/student-lookup?examNumber=XXX
 *
 * 결제 링크 포인트 사용을 위한 학생 조회 (공개 엔드포인트 — 인증 불필요)
 * 반환: 이름, 보유 포인트 잔액만 (민감 정보 마스킹)
 */
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const linkId = parseInt(params.id, 10);
  if (isNaN(linkId)) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다." }, { status: 400 });
  }

  const examNumber = req.nextUrl.searchParams.get("examNumber")?.trim();
  if (!examNumber) {
    return NextResponse.json({ error: "학번을 입력해 주세요." }, { status: 400 });
  }

  // 링크가 실제로 존재하며 포인트 사용이 허용된 경우만 처리
  const link = await getPrisma().paymentLink.findUnique({
    where: { id: linkId },
    select: { allowPoint: true, status: true, expiresAt: true },
  });

  if (!link) {
    return NextResponse.json({ error: "결제 링크를 찾을 수 없습니다." }, { status: 404 });
  }

  if (!link.allowPoint) {
    return NextResponse.json({ error: "이 결제 링크는 포인트 사용이 불가합니다." }, { status: 400 });
  }

  if (link.status !== "ACTIVE" || link.expiresAt < new Date()) {
    return NextResponse.json({ error: "만료되었거나 비활성화된 결제 링크입니다." }, { status: 400 });
  }

  // 학생 조회
  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    select: { name: true, examNumber: true },
  });

  if (!student) {
    return NextResponse.json({ error: "학번을 확인해 주세요. 등록된 학생을 찾을 수 없습니다." }, { status: 404 });
  }

  // 보유 포인트 합산 (양수: 지급, 음수: 차감)
  const pointAgg = await getPrisma().pointLog.aggregate({
    where: { examNumber },
    _sum: { amount: true },
  });

  const pointBalance = Math.max(0, pointAgg._sum.amount ?? 0);

  return NextResponse.json({
    data: {
      name: student.name,
      pointBalance,
    },
  });
}
