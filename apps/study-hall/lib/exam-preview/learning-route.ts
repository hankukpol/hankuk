import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth, requireStudentApiAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { forbidden, notFound } from "@/lib/errors";
import { isExamPreviewEnabled } from "@/lib/exam-preview/gate";
import { learningMutationSchema } from "@/lib/exam-preview/learning-types";
import {
  applyLearningCommand,
  type LearningActor,
} from "@/lib/exam-preview/learning-mutations";
import {
  learningSource,
  readLearningDocument,
  updateLearningDocument,
} from "@/lib/exam-preview/learning-store";
import { buildLearningPayload } from "@/lib/exam-preview/learning-report";
import { previewJson } from "@/lib/exam-preview/json-response";

export async function handleLearning(
  request: NextRequest,
  { params }: { params: { division: string } },
  previewOnly = false,
) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (previewOnly && !isExamPreviewEnabled())
      throw notFound("미리보기가 활성화되지 않았습니다.");
    const studentId =
      request.nextUrl.searchParams.get("studentId") ?? undefined;
    const auth = await requireApiAuth(params.division, [
      "ADMIN",
      "SUPER_ADMIN",
    ]);
    let actor: LearningActor;
    if (auth.ok)
      actor = {
        id: auth.session.id,
        role: auth.session.role as "ADMIN" | "SUPER_ADMIN",
      };
    else {
      if (auth.status === 503)
        return NextResponse.json(
          { error: auth.error },
          { status: 503, headers },
        );
      const student = await requireStudentApiAuth(params.division);
      if (!student.ok)
        return NextResponse.json(
          { error: student.error },
          { status: student.status, headers },
        );
      if (!studentId || student.session.studentId !== studentId)
        throw forbidden("본인의 학습 기록만 조회할 수 있습니다.");
      actor = { id: student.session.studentId, role: "STUDENT", studentId };
    }
    const disabled = await getDivisionFeatureDisabledError(
      params.division,
      "examManagement",
    );
    if (disabled) throw forbidden(disabled);
    const source = await learningSource(params.division);
    if (studentId && !source.students.some((s) => s.id === studentId))
      throw notFound("현재 학원의 학생을 찾을 수 없습니다.");
    let doc = await readLearningDocument(source.divisionId);
    if (request.method === "POST") {
      const origin = request.headers.get("origin");
      if (request.headers.get("sec-fetch-site") === "cross-site")
        throw forbidden("같은 사이트에서 요청해주세요.");
      if (origin) {
        let same = false;
        try {
          const url = new URL(origin);
          same =
            ["http:", "https:"].includes(url.protocol) &&
            url.origin === origin &&
            url.host === request.headers.get("host");
        } catch {
          /* Malformed origins are rejected. */
        }
        if (!same) throw forbidden("같은 사이트에서 요청해주세요.");
      }
      const input = learningMutationSchema.parse(await request.json());
      if ("studentId" in input.command && input.command.studentId !== studentId)
        throw forbidden("조회한 학생과 저장 대상이 다릅니다.");
      doc = await updateLearningDocument(source.divisionId, (current) =>
        applyLearningCommand(
          current,
          source,
          input.command,
          actor,
          input.revision,
          input.requestId,
        ),
      );
    }
    return previewJson(
      request,
      buildLearningPayload(source, doc, studentId, actor.role !== "STUDENT"),
      headers,
    );
  } catch (error) {
    const response = toApiErrorResponse(
      error,
      "학습 분석을 처리하지 못했습니다.",
      500,
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
