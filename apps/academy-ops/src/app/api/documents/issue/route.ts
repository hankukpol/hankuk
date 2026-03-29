import { AdminRole, DocumentType } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as {
      studentId?: string;
      docType?: DocumentType;
      note?: string;
    };

    const { studentId, docType, note } = body;

    if (!studentId || !docType) {
      return Response.json({ error: "studentId, docType은 필수입니다." }, { status: 400 });
    }

    // Validate docType is a valid DocumentType enum value
    const validDocTypes = Object.values(DocumentType) as string[];
    if (!validDocTypes.includes(docType)) {
      return Response.json({ error: "유효하지 않은 문서 유형입니다." }, { status: 400 });
    }

    // studentId is the examNumber (Student PK)
    const student = await getPrisma().student.findUnique({
      where: { examNumber: studentId },
      select: { examNumber: true },
    });

    if (!student) {
      return Response.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    }

    const issuance = await getPrisma().documentIssuance.create({
      data: {
        examNumber: studentId,
        docType,
        note: note?.trim() || null,
        issuedBy: auth.context.adminUser.id,
      },
    });

    return Response.json({ data: issuance }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "서류 발급 기록 실패" },
      { status: 400 },
    );
  }
}
