import { AdminMemoColor, AdminMemoScope, AdminRole } from "@prisma/client";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getSubjectDisplayLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RequestBody = {
  scoreId?: unknown;
  reportedScore?: unknown;
  reason?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const scoreId =
    typeof body.scoreId === "number"
      ? body.scoreId
      : typeof body.scoreId === "string"
        ? Number(body.scoreId)
        : NaN;
  const reason = typeof body.reason === "string" ? body.reason.trim() : null;
  const reportedScore =
    typeof body.reportedScore === "number"
      ? body.reportedScore
      : typeof body.reportedScore === "string"
        ? parseFloat(body.reportedScore)
        : NaN;

  if (!Number.isInteger(scoreId) || scoreId <= 0) {
    return Response.json({ error: "신고할 성적을 다시 선택해 주세요." }, { status: 400 });
  }

  if (!reason) {
    return Response.json({ error: "신고 사유를 입력해 주세요." }, { status: 400 });
  }

  if (isNaN(reportedScore) || reportedScore < 0 || reportedScore > 100) {
    return Response.json({ error: "실제 점수는 0~100 사이 숫자로 입력해 주세요." }, { status: 400 });
  }

  const prisma = getPrisma();
  const score = await prisma.score.findFirst({
    where: {
      id: scoreId,
      examNumber: auth.student.examNumber,
    },
    select: {
      sessionId: true,
      finalScore: true,
      rawScore: true,
      session: {
        select: {
          examDate: true,
          subject: true,
          displaySubjectName: true,
        },
      },
    },
  });

  if (!score) {
    return Response.json({ error: "신고 대상 성적을 찾을 수 없습니다." }, { status: 404 });
  }

  const examDate = formatDate(score.session.examDate);
  const subjectLabel = getSubjectDisplayLabel(
    score.session.subject,
    score.session.displaySubjectName,
  );
  const currentScore = score.finalScore ?? score.rawScore;
  const currentScoreText = currentScore !== null ? String(currentScore) : "미입력";
  const memoTitle = `[성적 오류 신고] ${auth.student.name} (${auth.student.examNumber}) — ${subjectLabel} ${examDate}`;
  const memoContent =
    `[성적 오류 신고] 시험일: ${examDate}, 과목: ${subjectLabel}, 현재 점수: ${currentScoreText}, 신고 점수: ${reportedScore}\n` +
    `사유: ${reason}`;

  const ownerAdmin = await prisma.adminUser.findFirst({
    where: {
      isActive: true,
      role: {
        in: [
          AdminRole.SUPER_ADMIN,
          AdminRole.DIRECTOR,
          AdminRole.DEPUTY_DIRECTOR,
          AdminRole.MANAGER,
        ],
      },
    },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true },
  });

  if (!ownerAdmin) {
    return Response.json(
      { error: "처리할 관리자 계정을 찾을 수 없습니다. 관리자에게 문의해 주세요." },
      { status: 500 },
    );
  }

  await prisma.adminMemo.create({
    data: {
      title: memoTitle,
      content: memoContent,
      color: AdminMemoColor.ROSE,
      scope: AdminMemoScope.TEAM,
      relatedStudentExamNumber: auth.student.examNumber,
      relatedExamSessionId: score.sessionId,
      ownerId: ownerAdmin.id,
    },
  });

  return Response.json({ data: { ok: true } }, { status: 201 });
}