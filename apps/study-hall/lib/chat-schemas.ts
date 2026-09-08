import { z } from "zod";

export const CHAT_MESSAGE_MAX_LENGTH = 2000;
export const CHAT_MESSAGE_DEFAULT_LIMIT = 50;
export const CHAT_MESSAGE_MAX_LIMIT = 100;
/** since 동기화는 한 번에 가져올 양을 따로 제한한다. */
export const CHAT_SYNC_MAX_LIMIT = 200;

/**
 * 제어 문자는 화면을 깨뜨리므로 저장 전에 제거한다.
 * 줄바꿈(\n)과 탭(\t)은 본문에서 의미가 있으므로 남긴다.
 */
const LINE_FEED = 10;
const TAB = 9;
const DELETE_CODE = 127;

function stripControlCharacters(value: string) {
  let result = "";

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const isControl = (code < 32 && code !== LINE_FEED && code !== TAB) || code === DELETE_CODE;

    if (!isControl) {
      result += char;
    }
  }

  return result;
}

export const chatMessageSchema = z.object({
  body: z
    .string()
    .transform((value) => stripControlCharacters(value).trim())
    .pipe(
      z
        .string()
        .min(1, "메시지를 입력해 주세요.")
        .max(CHAT_MESSAGE_MAX_LENGTH, `메시지는 ${CHAT_MESSAGE_MAX_LENGTH}자까지 보낼 수 있습니다.`),
    ),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

export const chatReadSchema = z.object({
  lastReadMessageId: z.string().trim().min(1).nullable().optional(),
});

export type ChatReadInput = z.infer<typeof chatReadSchema>;

/** 쿼리스트링은 전부 문자열이므로 숫자·날짜를 직접 좁힌다. */
export const chatMessageQuerySchema = z.object({
  before: z.string().trim().min(1).optional(),
  since: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), "조회 기준 시각이 올바르지 않습니다.")
    .optional(),
  limit: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : Number(value)))
    .refine(
      (value) => value === undefined || (Number.isInteger(value) && value >= 1 && value <= CHAT_MESSAGE_MAX_LIMIT),
      `조회 개수는 1에서 ${CHAT_MESSAGE_MAX_LIMIT} 사이여야 합니다.`,
    ),
});

export type ChatMessageQueryInput = z.infer<typeof chatMessageQuerySchema>;
