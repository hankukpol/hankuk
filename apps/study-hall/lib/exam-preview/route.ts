import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ANALYSIS_HEADERS,
  authorizeExamAnalysis,
} from "@/lib/exam-analysis-route";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { isExamPreviewEnabled } from "./gate";
import { getExamPreview } from "./service";
import { previewJson } from "./json-response";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "날짜를 확인해주세요.");
const schema = z.object({
  examTypeId: z.string().min(1).max(200),
  studentId: z.string().min(1).max(200).optional(),
  examDate: date.optional(),
  from: date.optional(),
  to: date.optional(),
});
export async function handleExamPreview(
  request: NextRequest,
  division: string,
  kind: "regular" | "morning",
  previewOnly = true,
) {
  if (previewOnly && !isExamPreviewEnabled())
    return NextResponse.json(
      { error: "미리보기가 활성화되지 않았습니다." },
      { status: 404, headers: ANALYSIS_HEADERS },
    );
  try {
    const query = schema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const auth = await authorizeExamAnalysis(division, query.studentId);
    if (!auth.ok)
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status, headers: ANALYSIS_HEADERS },
      );
    const disabled = await getDivisionFeatureDisabledError(
      division,
      "examManagement",
    );
    if (disabled)
      return NextResponse.json(
        { error: disabled },
        { status: 403, headers: ANALYSIS_HEADERS },
      );
    return previewJson(
      request,
      {
        ...(await getExamPreview(division, kind, query, auth.viewer)),
        isPreview: previewOnly,
      },
      ANALYSIS_HEADERS,
    );
  } catch (error) {
    const response = toApiErrorResponse(
      error,
      "성적 분석을 불러오지 못했습니다.",
      500,
    );
    response.headers.set("Cache-Control", ANALYSIS_HEADERS["Cache-Control"]);
    return response;
  }
}
