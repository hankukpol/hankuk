import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import {
  getZodErrorMessage,
  toApiErrorResponse,
} from "@/lib/api-error-response";
import { badRequest } from "@/lib/errors";
import {
  EXAM_IMPORT_FILE_MAX_BYTES,
  examImportSelectionSchema,
} from "@/lib/exam-import-schemas";
import {
  confirmExamImport,
  previewExamImport,
} from "@/lib/services/exam-import.service";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { revalidatePath } from "next/cache";

export async function handleExamImport(
  request: NextRequest,
  division: string,
  confirm: boolean,
) {
  const auth = await requireApiAuth(division, ["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  const disabled = await getDivisionFeatureDisabledError(
    division,
    "examManagement",
  );
  if (disabled) return NextResponse.json({ error: disabled }, { status: 403 });
  try {
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw badRequest("채점표와 문항분석표 파일을 선택해주세요.");
    const length = Number(request.headers.get("content-length"));
    if (length > EXAM_IMPORT_FILE_MAX_BYTES * 2 + 65536)
      throw badRequest("파일은 각각 5MB 이하여야 합니다.");
    // Content-Length may be absent or forged; bound streamed bytes before multipart parsing.
    const reader = request.body?.getReader();
    if (!reader) throw badRequest("업로드 파일을 읽을 수 없습니다.");
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > EXAM_IMPORT_FILE_MAX_BYTES * 2 + 65536) {
          await reader.cancel();
          throw badRequest("파일은 각각 5MB 이하여야 합니다.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = Buffer.concat(chunks);
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    })
      .formData()
      .catch(() => {
        throw badRequest("업로드 파일을 읽을 수 없습니다.");
      });
    const values = Object.fromEntries(
      ["category", "examTypeId", "examRound", "topic", "overwrite"].map(
        (key) => [key, form.get(key) || undefined],
      ),
    );
    const selection = examImportSelectionSchema.safeParse(values);
    if (!selection.success)
      throw badRequest(
        getZodErrorMessage(selection.error, "시험 정보를 확인해주세요."),
      );
    const score = form.get("scoreFile");
    const analysis = form.get("analysisFile");
    if (
      !score ||
      typeof score === "string" ||
      !analysis ||
      typeof analysis === "string"
    )
      throw badRequest("두 파일을 모두 선택해주세요.");
    if (
      [score, analysis].some(
        (file) =>
          file.size === 0 ||
          file.size > EXAM_IMPORT_FILE_MAX_BYTES ||
          !/\.xls$/i.test(file.name),
      )
    )
      throw badRequest(
        "비어 있지 않은 .xls 파일을 각각 5MB 이하로 선택해주세요.",
      );
    const [scoreBuffer, analysisBuffer] = await Promise.all([
      score.arrayBuffer(),
      analysis.arrayBuffer(),
    ]);
    const files = {
      scoreBuffer: Buffer.from(scoreBuffer),
      analysisBuffer: Buffer.from(analysisBuffer),
    };
    if (!confirm)
      return NextResponse.json(
        {
          preview: await previewExamImport(
            division,
            auth.session,
            files,
            selection.data,
          ),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const result = await confirmExamImport(
      division,
      auth.session,
      files,
      selection.data,
    );
    revalidatePath(`/${division}/admin/exams`);
    revalidateDivisionOperationalViews(division);
    return NextResponse.json(
      { result },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return toApiErrorResponse(error, "성적 파일 처리 중 오류가 발생했습니다.");
  }
}
