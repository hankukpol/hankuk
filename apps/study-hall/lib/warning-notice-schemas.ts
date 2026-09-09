import { z } from "zod";

import { INTERVIEW_RESULT_TYPE_VALUES } from "@/lib/interview-meta";
import { WARNING_NOTICE_CHANNEL_VALUES } from "@/lib/warning-notice-meta";

export const warningNoticeSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해 주세요."),
  // 경고 단계는 면담 결과 유형과 동일한 4단계를 쓴다.
  stage: z.enum(INTERVIEW_RESULT_TYPE_VALUES, "경고 단계를 선택해 주세요."),
  channel: z.enum(WARNING_NOTICE_CHANNEL_VALUES, "안내 방법을 선택해 주세요."),
  // 실제 보낸 문안. 남겨두면 나중에 "무엇을 알렸는지"까지 확인할 수 있다.
  noticeBody: z.string().trim().max(2000).nullable().optional(),
  memo: z.string().trim().max(500).nullable().optional(),
});

export type WarningNoticeSchemaInput = z.infer<typeof warningNoticeSchema>;
