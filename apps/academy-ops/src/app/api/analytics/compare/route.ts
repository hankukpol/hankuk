import { AdminRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getStudentComparisonAnalysis } from "@/lib/analytics/analysis";

function readNumberParam(searchParams: URLSearchParams, key: string) {
  const raw = searchParams.get(key);
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const examNumberA = searchParams.get("examNumberA")?.trim() ?? "";
  const examNumberB = searchParams.get("examNumberB")?.trim() ?? "";

  if (!examNumberA || !examNumberB) {
    return NextResponse.json(
      { error: "비교할 두 수험번호를 모두 입력해 주세요." },
      { status: 400 },
    );
  }

  try {
    const result = await getStudentComparisonAnalysis({
      examNumberA,
      examNumberB,
      periodId: readNumberParam(searchParams, "periodId"),
      recent: readNumberParam(searchParams, "recent"),
    });

    switch (result.kind) {
      case "ok":
        return NextResponse.json(result.data);
      case "same_student":
        return NextResponse.json(
          { error: "동일한 수험번호를 양쪽에 동시에 비교할 수 없습니다." },
          { status: 400 },
        );
      case "missing_student_a":
        return NextResponse.json(
          { error: `비교 A 수험번호 ${result.examNumber}에 해당하는 학생을 찾을 수 없습니다.` },
          { status: 404 },
        );
      case "missing_student_b":
        return NextResponse.json(
          { error: `비교 B 수험번호 ${result.examNumber}에 해당하는 학생을 찾을 수 없습니다.` },
          { status: 404 },
        );
      case "exam_type_mismatch":
        return NextResponse.json(
          { error: "같은 직렬 학생끼리만 비교할 수 있습니다." },
          { status: 400 },
        );
      default:
        return NextResponse.json(
          { error: "학생 비교 데이터를 불러오지 못했습니다." },
          { status: 500 },
        );
    }
  } catch (error) {
    console.error("Failed to load student comparison api", error);
    return NextResponse.json(
      { error: "학생 비교 데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
