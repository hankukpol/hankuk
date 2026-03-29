import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getStudentMergePreview, mergeStudentData } from "@/lib/students/merge";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const sourceExamNumber = request.nextUrl.searchParams.get("sourceExamNumber") ?? "";
    const targetExamNumber = request.nextUrl.searchParams.get("targetExamNumber") ?? "";
    const preview = await getStudentMergePreview({ sourceExamNumber, targetExamNumber });
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "학생 병합 미리보기에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      sourceExamNumber?: string;
      targetExamNumber?: string;
    };

    const result = await mergeStudentData({
      adminId: auth.context.adminUser.id,
      sourceExamNumber: String(body.sourceExamNumber ?? ""),
      targetExamNumber: String(body.targetExamNumber ?? ""),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "학생 병합에 실패했습니다." },
      { status: 400 },
    );
  }
}
