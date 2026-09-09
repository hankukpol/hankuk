import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { previewWarningThresholds } from "@/lib/services/point.service";

const previewSchema = z
  .object({
    warnLevel1: z.coerce.number().int().min(0),
    warnLevel2: z.coerce.number().int().min(0),
    warnInterview: z.coerce.number().int().min(0),
    warnWithdraw: z.coerce.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    if (value.warnLevel1 >= value.warnLevel2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "1차 경고 기준은 2차 경고 기준보다 작아야 합니다.",
        path: ["warnLevel1"],
      });
    }

    if (value.warnLevel2 >= value.warnInterview) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "2차 경고 기준은 면담 기준보다 작아야 합니다.",
        path: ["warnLevel2"],
      });
    }

    if (value.warnInterview >= value.warnWithdraw) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "면담 기준은 퇴원 기준보다 작아야 합니다.",
        path: ["warnInterview"],
      });
    }
  });

export async function POST(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = previewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "경고 기준을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const preview = await previewWarningThresholds(params.division, parsed.data);
    return NextResponse.json({ preview });
  } catch (error) {
    return toApiErrorResponse(error, "영향 미리보기를 계산하지 못했습니다.", 400);
  }
}
