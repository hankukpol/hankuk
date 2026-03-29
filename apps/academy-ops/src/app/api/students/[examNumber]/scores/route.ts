import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getStudentHistory } from "@/lib/students/service";

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

  const student = await getStudentHistory(params.examNumber);

  if (!student) {
    return NextResponse.json({ error: "수강생을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ student });
}
