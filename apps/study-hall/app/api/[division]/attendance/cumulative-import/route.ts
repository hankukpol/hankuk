import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { badRequest } from "@/lib/errors";
import { ExamImportParseError, EXAM_IMPORT_LIMITS } from "@/lib/exam-import-parser";
import { importCumulativeAttendance } from "@/lib/services/cumulative-attendance.service";

export const runtime = "nodejs";
const selectionSchema = z.array(z.object({ studentId: z.string().min(1).max(100), status: z.enum(["PRESENT", "ABSENT"]) }).strict()).max(5000);
export async function POST(request: NextRequest, { params }: { params: { division: string } }) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const disabled = await getDivisionFeatureDisabledError(params.division, "attendanceManagement");
  if (disabled) return NextResponse.json({ error: disabled }, { status: 403 });
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "잘못된 요청 출처입니다." }, { status: 403 });
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data")) throw badRequest("채점표 파일을 선택해주세요.");
    const limit = EXAM_IMPORT_LIMITS.fileBytes * 2 + 65536;
    if (Number(request.headers.get("content-length")) > limit) throw badRequest("파일은 각각 5MB 이하로 선택해주세요.");
    const reader = request.body?.getReader();
    if (!reader) throw badRequest("파일을 읽을 수 없습니다.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw badRequest("파일은 각각 5MB 이하로 선택해주세요."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData();
    const file = async (key: string, required: boolean) => {
      const value = form.get(key);
      if (!value && !required) return undefined;
      if (!value || typeof value === "string" || !/\.xls$/i.test(value.name) || !value.size || value.size > EXAM_IMPORT_LIMITS.fileBytes)
        throw badRequest("비어 있지 않은 .xls 파일을 각각 5MB 이하로 선택해주세요.");
      return Buffer.from(await value.arrayBuffer());
    };
    const mode = form.get("mode");
    if (mode !== "preview" && mode !== "confirm") throw badRequest("가져오기 단계를 확인해주세요.");
    let selection;
    try { selection = selectionSchema.parse(JSON.parse(String(form.get("selection") ?? "[]"))); }
    catch { throw badRequest("반영할 학생과 응시 상태를 확인해주세요."); }
    const date = String(form.get("date") ?? "");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("시험일을 확인해주세요.");
    const result = await importCumulativeAttendance(params.division, auth.session.id,
      { score: (await file("scoreFile", true))!, analysis: await file("analysisFile", false) },
      { date: date || undefined, token: String(form.get("token") ?? ""), selection }, mode === "confirm");
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toApiErrorResponse(error instanceof ExamImportParseError ? badRequest(error.message) : error, "누적시험 출석 파일을 처리하지 못했습니다.");
  }
}
