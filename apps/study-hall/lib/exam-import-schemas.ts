import { z } from "zod";

export const EXAM_IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const examImportSelectionSchema = z.object({
  category: z.enum(["MORNING", "REGULAR"]),
  examTypeId: z.string().trim().min(1).max(128).optional(),
  examRound: z.coerce.number().int().positive().max(2147483647).optional(),
  topic: z
    .string()
    .trim()
    .max(200, "진도는 200자 이내로 입력해주세요.")
    .optional(),
  overwrite: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
