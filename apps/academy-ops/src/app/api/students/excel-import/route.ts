import { AdminRole, ExamType, StudentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  executeStudentFileImport,
  previewStudentFileImport,
} from "@/lib/students/service";

export const dynamic = "force-dynamic";

type Mode = "preview" | "execute";
type DuplicateStrategy = "UPDATE" | "SKIP" | "OVERWRITE";

function parseDefaults(formData: FormData): {
  examType: ExamType;
  studentType: StudentType;
  duplicateStrategy: DuplicateStrategy;
  classNameFallback?: string;
} {
  const raw = formData.get("defaults");
  if (typeof raw !== "string" || !raw) {
    throw new Error("기본값 정보가 필요합니다.");
  }
  const parsed = JSON.parse(raw) as {
    examType?: string;
    studentType?: string;
    duplicateStrategy?: string;
    classNameFallback?: string;
  };

  const validExamTypes: ExamType[] = ["GONGCHAE", "GYEONGCHAE"];
  const validStudentTypes: StudentType[] = ["NEW", "EXISTING"];
  const validStrategies: DuplicateStrategy[] = ["UPDATE", "SKIP", "OVERWRITE"];

  if (!parsed.examType || !validExamTypes.includes(parsed.examType as ExamType)) {
    throw new Error("올바른 직렬(examType)을 지정해 주세요.");
  }
  if (!parsed.studentType || !validStudentTypes.includes(parsed.studentType as StudentType)) {
    throw new Error("올바른 학생 구분(studentType)을 지정해 주세요.");
  }
  if (
    !parsed.duplicateStrategy ||
    !validStrategies.includes(parsed.duplicateStrategy as DuplicateStrategy)
  ) {
    throw new Error("올바른 중복 처리 방식(duplicateStrategy)을 지정해 주세요.");
  }

  return {
    examType: parsed.examType as ExamType,
    studentType: parsed.studentType as StudentType,
    duplicateStrategy: parsed.duplicateStrategy as DuplicateStrategy,
    classNameFallback: parsed.classNameFallback ?? undefined,
  };
}

function parseMapping(formData: FormData): Record<string, number | undefined> {
  const raw = formData.get("mapping");
  if (typeof raw !== "string" || !raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, number | undefined>;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const mode = (formData.get("mode") as Mode | null) ?? "preview";
    const defaults = parseDefaults(formData);
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Excel 또는 CSV 파일을 업로드해 주세요." },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "파일이 비어 있습니다." }, { status: 400 });
    }

    // 50 MB 제한
    const MAX_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "파일 크기가 50 MB를 초과합니다." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (mode === "preview") {
      const result = await previewStudentFileImport({
        fileName: file.name,
        buffer,
        defaults,
      });
      return NextResponse.json(result);
    }

    // execute
    const result = await executeStudentFileImport({
      adminId: auth.context.adminUser.id,
      fileName: file.name,
      buffer,
      defaults,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Excel 가져오기 처리 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}
