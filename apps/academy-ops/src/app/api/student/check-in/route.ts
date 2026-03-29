import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { requireStudentFromRequest } from "@/lib/auth/require-student";

export const dynamic = "force-dynamic";

type QrPayload = {
  sessionId: string;
  exp: number;
};

function parseQrToken(token: string): QrPayload | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const payload = JSON.parse(decoded) as unknown;
    if (
      typeof payload === "object" &&
      payload !== null &&
      "sessionId" in payload &&
      "exp" in payload &&
      typeof (payload as QrPayload).sessionId === "string" &&
      typeof (payload as QrPayload).exp === "number"
    ) {
      return payload as QrPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// POST /api/student/check-in
// 학생 QR 체크인
export async function POST(request: NextRequest) {
  // 학생 인증
  let student: Awaited<ReturnType<typeof requireStudentFromRequest>>;

  try {
    student = await requireStudentFromRequest(request);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    if (code === "UNAUTHORIZED" || code === "INVALID_TOKEN") {
      return NextResponse.json(
        { error: "학생 포털 로그인이 필요합니다." },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: "학생 정보를 확인할 수 없습니다." },
      { status: 401 },
    );
  }

  // 요청 바디에서 토큰 추출
  let token: string;

  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token !== "string" || !body.token) {
      return NextResponse.json({ error: "token이 필요합니다." }, { status: 400 });
    }
    token = body.token;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // 토큰 파싱
  const payload = parseQrToken(token);

  if (!payload) {
    return NextResponse.json({ error: "유효하지 않은 QR 코드입니다." }, { status: 400 });
  }

  // 만료 확인
  if (Date.now() > payload.exp) {
    return NextResponse.json({ error: "QR 코드가 만료되었습니다." }, { status: 400 });
  }

  const { sessionId } = payload;

  // 세션 조회
  const session = await getPrisma().lectureSession.findUnique({
    where: { id: sessionId },
    include: {
      schedule: {
        select: {
          cohortId: true,
          subjectName: true,
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "강의 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  if (session.isCancelled) {
    return NextResponse.json({ error: "취소된 강의 세션입니다." }, { status: 400 });
  }

  // 이미 체크인 여부 확인 (선착순 upsert 방지)
  const existing = await getPrisma().lectureAttendance.findUnique({
    where: {
      sessionId_studentId: {
        sessionId,
        studentId: student.examNumber,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "이미 출결 처리가 완료된 세션입니다." },
      { status: 409 },
    );
  }

  // 현재 시간 vs 강의 시작 시간 → 출석/지각 판정
  // startTime 형식: "HH:mm"
  const now = new Date();
  const checkedAt = now;

  // 세션 날짜 기준으로 시작 시간 계산
  const [startHour, startMin] = session.startTime.split(":").map(Number);
  const sessionStart = new Date(session.sessionDate);
  sessionStart.setHours(startHour, startMin, 0, 0);

  // 5분 유예 적용 (startTime + 5분 이후 체크인 → 지각)
  const graceMs = 5 * 60 * 1000;
  const lateThreshold = new Date(sessionStart.getTime() + graceMs);

  const attendStatus: "PRESENT" | "LATE" = now > lateThreshold ? "LATE" : "PRESENT";

  // LectureAttendance 생성
  const attendance = await getPrisma().lectureAttendance.create({
    data: {
      sessionId,
      studentId: student.examNumber,
      status: attendStatus,
      checkedAt,
    },
  });

  const message =
    attendStatus === "PRESENT"
      ? `${student.name} 학생 출석이 확인되었습니다.`
      : `${student.name} 학생 지각 처리되었습니다.`;

  return NextResponse.json({
    data: {
      status: attendance.status,
      checkedAt: attendance.checkedAt.toISOString(),
      message,
    },
  });
}
