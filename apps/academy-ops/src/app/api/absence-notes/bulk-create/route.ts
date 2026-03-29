/**
 * POST /api/absence-notes/bulk-create
 *
 * 한 학생의 여러 회차에 사유서를 한 번에 등록하는 API.
 *
 * 요청 Body:
 * - examNumber: 학생 수험번호 (필수)
 * - sessionIds: 등록할 회차 ID 배열 (필수, 1개 이상)
 * - reason: 사유 내용 (필수)
 * - absenceCategory: 사유 카테고리 (MEDICAL·FAMILY·MILITARY·OTHER)
 * - attendCountsAsAttendance: 출석률 포함 여부 (선택)
 * - attendGrantsPerfectAttendance: 개근 인정 여부 (선택)
 * - adminNote: 관리자 메모 (선택)
 *
 * 응답: BulkCreateAbsenceNotesResult { succeeded, skipped, autoApproved, errors }
 * - 이미 존재하는 회차는 skipped로 집계 (중복 안전)
 * - MILITARY 카테고리는 자동 승인 처리
 */
import { AbsenceCategory, AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { bulkCreateAbsenceNotes } from "@/lib/absence-notes/service";

type RequestBody = {
  examNumber?: string;
  sessionIds?: number[];
  reason?: string;
  absenceCategory?: AbsenceCategory;
  attendCountsAsAttendance?: boolean;
  attendGrantsPerfectAttendance?: boolean;
  adminNote?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;

    if (!Array.isArray(body.sessionIds) || body.sessionIds.length === 0) {
      return NextResponse.json({ error: "회차를 선택하세요." }, { status: 400 });
    }

    const result = await bulkCreateAbsenceNotes({
      adminId: auth.context.adminUser.id,
      payload: {
        examNumber: String(body.examNumber ?? ""),
        sessionIds: body.sessionIds.map(Number),
        reason: String(body.reason ?? ""),
        absenceCategory: body.absenceCategory ?? AbsenceCategory.OTHER,
        attendCountsAsAttendance: Boolean(body.attendCountsAsAttendance),
        attendGrantsPerfectAttendance: Boolean(body.attendGrantsPerfectAttendance),
        adminNote: body.adminNote ?? null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "일괄 등록에 실패했습니다." },
      { status: 400 },
    );
  }
}
