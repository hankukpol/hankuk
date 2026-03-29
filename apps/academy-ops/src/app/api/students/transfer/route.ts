import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getStudentTransferPreview, transferStudentData } from "@/lib/students/transfer";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const fromExamNumber = request.nextUrl.searchParams.get("fromExamNumber") ?? "";
    const toExamNumber = request.nextUrl.searchParams.get("toExamNumber") ?? "";
    const preview = await getStudentTransferPreview({ fromExamNumber, toExamNumber });
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수험번호 이전 미리보기에 실패했습니다." },
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
      fromExamNumber?: string;
      toExamNumber?: string;
    };

    const result = await transferStudentData({
      adminId: auth.context.adminUser.id,
      fromExamNumber: String(body.fromExamNumber ?? ""),
      toExamNumber: String(body.toExamNumber ?? ""),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수험번호 이전에 실패했습니다." },
      { status: 400 },
    );
  }
}
