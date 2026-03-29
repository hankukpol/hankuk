import { NextRequest } from "next/server";
import { Subject } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { requireStudentFromRequest } from "@/lib/auth/require-student";
import { serializeTargetScores, parseTargetScores } from "@/lib/analytics/analysis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let student: Awaited<ReturnType<typeof requireStudentFromRequest>>;
  try {
    student = await requireStudentFromRequest(request);
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const data = await getPrisma().student.findUnique({
    where: { examNumber: student.examNumber },
    select: { targetScores: true },
  });

  const targetScores = parseTargetScores(data?.targetScores ?? null);

  return Response.json({ data: { targetScores } });
}

export async function PATCH(request: NextRequest) {
  let student: Awaited<ReturnType<typeof requireStudentFromRequest>>;
  try {
    student = await requireStudentFromRequest(request);
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: { targetScores?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const rawScores = body.targetScores;
  if (!rawScores || typeof rawScores !== "object" || Array.isArray(rawScores)) {
    return Response.json({ error: "targetScores 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // Validate each subject key and score value
  const validated: Partial<Record<Subject, number>> = {};
  const validSubjects = new Set<string>(Object.values(Subject));

  for (const [key, val] of Object.entries(rawScores as Record<string, unknown>)) {
    if (!validSubjects.has(key)) continue;
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      return Response.json({ error: `${key} 점수는 0~100 사이여야 합니다.` }, { status: 400 });
    }
    validated[key as Subject] = Math.round(num);
  }

  const serialized = serializeTargetScores(validated);

  await getPrisma().student.update({
    where: { examNumber: student.examNumber },
    data: { targetScores: serialized },
  });

  return Response.json({ data: { targetScores: validated } });
}
