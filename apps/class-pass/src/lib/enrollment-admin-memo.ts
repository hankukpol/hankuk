import { z } from 'zod'

export const ADMIN_MEMO_MAX_LENGTH = 2000
export const adminMemoSaveSchema = z.object({
  courseId: z.number().int().positive().safe(),
  body: z.string().trim().min(1).max(ADMIN_MEMO_MAX_LENGTH),
  expectedRevision: z.number().int().positive().safe().nullable(),
  expectedCreatedAt: z.string().datetime({offset:true}).nullable().default(null),
}).strict()

export const adminMemoDeleteSchema = adminMemoSaveSchema.omit({body:true}).extend({
  expectedRevision: z.number().int().positive().safe(),
  expectedCreatedAt: z.string().datetime({offset:true}),
}).strict()

export type EnrollmentAdminMemo = {
  enrollment_id: number
  body: string
  revision: number
  created_at: string
  updated_at: string
}

export function formatAdminMemoDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value))
}
