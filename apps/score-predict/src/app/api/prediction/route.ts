import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { buildAdminPreviewCandidates } from "@/lib/admin-preview";
import { authOptions } from "@/lib/auth";
import { PredictionError, calculatePrediction } from "@/lib/prediction";

export const runtime = "nodejs";

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const submissionId = parsePositiveInteger(searchParams.get("submissionId"));
  const page = parsePositiveInteger(searchParams.get("page"));
  const limit = parsePositiveInteger(searchParams.get("limit"));
  const isAdmin = session.user.role === "ADMIN";
  const role = isAdmin ? "ADMIN" : "USER";

  try {
    const adminPreviewCandidates = isAdmin ? await buildAdminPreviewCandidates() : [];

    // MOCK 데이터 없고 명시적 submissionId도 없으면 관리자 미리보기 불가
    if (isAdmin && !submissionId && adminPreviewCandidates.length === 0) {
      return NextResponse.json(
        {
          error: "위 검색창에서 학생 이름 또는 수험번호를 입력하여 합격예측 데이터를 조회하세요.",
          isAdminPreview: true,
          adminPreviewCandidates: [],
        },
        { status: 404 }
      );
    }

    const effectiveSubmissionId = isAdmin
      ? (submissionId ?? adminPreviewCandidates[0]?.submissionId)
      : submissionId;

    const result = await calculatePrediction(userId, {
      submissionId: effectiveSubmissionId,
      page,
      limit,
    }, role);

    return NextResponse.json(
      isAdmin
        ? {
            ...result,
            isAdminPreview: true,
            adminPreviewCandidates,
          }
        : result
    );
  } catch (error) {
    if (error instanceof PredictionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("GET /api/prediction error", error);
    return NextResponse.json({ error: "합격예측 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}
