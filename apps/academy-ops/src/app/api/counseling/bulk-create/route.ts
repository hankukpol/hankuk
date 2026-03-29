/**
 * POST /api/counseling/bulk-create
 *
 * 여러 학생에게 동일한 면담 내용을 한 번에 등록하는 API.
 *
 * 요청 Body:
 * - examNumbers: 수험번호 배열 (필수, 1개 이상)
 * - counselorName: 담당 강사명 (필수)
 * - content: 면담 내용 (필수)
 * - recommendation: 추천 학습 방향 (선택)
 * - counseledAt: 면담 일자 ISO 문자열 (필수)
 * - nextSchedule: 다음 면담 일정 ISO 문자열 (선택)
 *
 * 응답: BulkCreateCounselingResult { succeeded, errors }
 * - 일부 학생 실패 시에도 나머지는 정상 등록, errors 배열에 실패 목록 포함
 */
import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { bulkCreateCounselingRecords } from "@/lib/counseling/service";

type RequestBody = {
  examNumbers?: string[];
  counselorName?: string;
  content?: string;
  recommendation?: string | null;
  counseledAt?: string;
  nextSchedule?: string | null;
};

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as RequestBody;

    // 빈 배열 전송 방지: 학생 미선택 상태로 호출하는 경우 조기 반환
    if (!Array.isArray(body.examNumbers) || body.examNumbers.length === 0) {
      return NextResponse.json({ error: "학생을 1명 이상 선택하세요." }, { status: 400 });
    }

    const result = await bulkCreateCounselingRecords({
      adminId: auth.context.adminUser.id,
      payload: {
        examNumbers: body.examNumbers,
        counselorName: String(body.counselorName ?? ""),
        content: String(body.content ?? ""),
        recommendation: body.recommendation ?? null,
        counseledAt: new Date(String(body.counseledAt ?? "")),
        nextSchedule: body.nextSchedule ? new Date(body.nextSchedule) : null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    // 일부 실패가 있어도 200 반환, 클라이언트가 errors 배열을 확인해 처리
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "일괄 면담 기록 저장에 실패했습니다." },
      { status: 400 },
    );
  }
}
