import { z } from "zod";

export const announcementScopeValues = ["DIVISION", "GLOBAL"] as const;

export const announcementSchema = z.object({
  title: z.string().trim().min(1, "공지 제목을 입력해 주세요.").max(120),
  content: z.string().trim().min(1, "공지 내용을 입력해 주세요.").max(3000),
  isPinned: z.boolean().optional(),
  scope: z.enum(announcementScopeValues, "공지 범위를 선택해 주세요."),
  publishedAt: z.string().trim().nullable().optional(),
});

export type AnnouncementSchemaInput = z.infer<typeof announcementSchema>;
