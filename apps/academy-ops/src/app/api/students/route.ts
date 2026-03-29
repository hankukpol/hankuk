import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  createStudent,
  listStudentsPage,
  parseStudentForm,
} from "@/lib/students/service";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const examType = searchParams.get("examType") as ExamType | null;
  const search = searchParams.get("search") ?? "";
  const generationValue = searchParams.get("generation");
  const activeOnly = searchParams.get("activeOnly") !== "false";
  const generation = generationValue ? Number(generationValue) : undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? "30") || 30, 1), 100);

  const result = await listStudentsPage({
    examType: examType ?? undefined,
    search,
    generation,
    activeOnly,
    page,
    pageSize,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const student = parseStudentForm(body);
    const created = await createStudent({
      adminId: auth.context.adminUser.id,
      student,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ student: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수강생 생성에 실패했습니다." },
      { status: 400 },
    );
  }
}
