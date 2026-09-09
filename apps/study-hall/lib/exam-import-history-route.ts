import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { listExamImports, deleteExamImport } from "@/lib/services/exam-import.service";
import { revalidatePath } from "next/cache";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
const querySchema = z.object({ examTypeId: idSchema.optional() });

export async function handleExamImportHistory(request: NextRequest, division: string, sessionId?: string) {
  try {
    const auth = await requireApiAuth(division, ["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
    const disabled = await getDivisionFeatureDisabledError(division, "examManagement");
    if (disabled) return NextResponse.json({ error: disabled }, { status: 403, headers });
    if (sessionId !== undefined) {
      const result = await deleteExamImport(division, auth.session, idSchema.parse(sessionId));
      revalidatePath(`/${division}/admin/exams`);
      revalidatePath(`/${division}/student/exams`);
      return NextResponse.json({ result }, { headers });
    }
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json({ history: await listExamImports(division, auth.session, query) }, { headers });
  } catch (error) {
    return toApiErrorResponse(error, "가져오기 이력을 처리하지 못했습니다.", 500);
  }
}
