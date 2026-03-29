import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getStudentCumulativeAnalysis } from "@/lib/analytics/analysis";

type RouteContext = {
  params: {
    examNumber: string;
  };
};

export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const data = await getStudentCumulativeAnalysis(params.examNumber);

    if (!data) {
      return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load cumulative student analysis", error);
    return NextResponse.json(
      { error: "학생 분석 데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
