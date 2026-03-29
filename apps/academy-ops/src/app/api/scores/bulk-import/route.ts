import { AdminRole, AttendType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { executePastedScores } from "@/lib/scores/service";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ALLOWED_ATTEND_TYPES = Object.values(AttendType) as string[];

type ImportErrorRow = {
  rowNumber: number;
  raw: string;
  reason: string;
};

/**
 * CSV 형식: 학번,이름,원점수[,응시유형]
 * 헤더 행은 "학번" 또는 "examNumber"로 시작하면 자동 건너뜀
 * 응시유형: NORMAL(기본), MAKEUP, ABSENT, LATE (생략 시 NORMAL)
 */
function parseCsv(text: string): {
  pasteText: string;
  skippedRows: ImportErrorRow[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const validRows: string[] = [];
  const skippedRows: ImportErrorRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const values = line.split(",").map((v) => v.trim());

    // 헤더 행 건너뜀 (첫 열이 "학번", "examNumber", "수험번호" 등)
    const firstCell = values[0]?.toLowerCase() ?? "";
    if (
      firstCell === "학번" ||
      firstCell === "examnumber" ||
      firstCell === "수험번호" ||
      firstCell === "번호"
    ) {
      continue;
    }

    const examNumber = values[0] ?? "";
    const name = values[1] ?? "";
    const rawScoreRaw = values[2] ?? "";
    const attendTypeRaw = values[3]?.trim().toUpperCase() ?? "";

    if (!examNumber) {
      skippedRows.push({
        rowNumber: i + 1,
        raw: line,
        reason: "학번이 비어 있습니다.",
      });
      continue;
    }

    const rawScore = Number(rawScoreRaw.replace(/,/g, ""));
    if (rawScoreRaw === "" || !Number.isFinite(rawScore)) {
      skippedRows.push({
        rowNumber: i + 1,
        raw: line,
        reason: `원점수(${rawScoreRaw || "빈 값"})가 숫자가 아닙니다.`,
      });
      continue;
    }

    // 응시유형 검증
    const attendType =
      attendTypeRaw && ALLOWED_ATTEND_TYPES.includes(attendTypeRaw)
        ? attendTypeRaw
        : "";

    // 탭 구분자로 변환 (paste import 형식: 수험번호\t이름\t원점수[\t응시유형])
    const tabRow = attendType
      ? `${examNumber}\t${name}\t${rawScore}\t${attendType}`
      : `${examNumber}\t${name}\t${rawScore}`;

    validRows.push(tabRow);
  }

  return {
    pasteText: validRows.join("\n"),
    skippedRows,
  };
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sessionIdRaw = formData.get("sessionId");
    const attendTypeRaw = (formData.get("attendType") as string | null)?.trim().toUpperCase() ?? "";

    if (!Number.isFinite(Number(sessionIdRaw)) || Number(sessionIdRaw) <= 0) {
      return NextResponse.json({ error: "시험 회차를 선택해 주세요." }, { status: 400 });
    }

    const sessionId = Number(sessionIdRaw);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV 파일을 선택해 주세요." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "csv" && ext !== "txt") {
      return NextResponse.json(
        { error: "CSV (.csv) 또는 텍스트 (.txt) 파일만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }

    const rawText = await file.text();

    const { pasteText, skippedRows } = parseCsv(rawText);

    if (!pasteText.trim()) {
      return NextResponse.json(
        {
          error: `유효한 성적 행이 없습니다. ${skippedRows.length > 0 ? `(건너뜀: ${skippedRows.length}행)` : ""}`,
          data: { success: 0, skipped: skippedRows.length, errors: skippedRows },
        },
        { status: 400 },
      );
    }

    const defaultAttendType =
      ALLOWED_ATTEND_TYPES.includes(attendTypeRaw) ? (attendTypeRaw as AttendType) : undefined;

    const result = await executePastedScores({
      adminId: auth.context.adminUser.id,
      sessionId,
      text: pasteText,
      attendType: defaultAttendType,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({
      data: {
        success: result.createdCount + result.updatedCount,
        created: result.createdCount,
        updated: result.updatedCount,
        unresolved: result.unresolvedCount,
        invalid: result.invalidCount,
        skipped: skippedRows.length,
        errors: skippedRows,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CSV 일괄 입력에 실패했습니다." },
      { status: 400 },
    );
  }
}
