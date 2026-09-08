import { z } from 'zod'

export const enrollmentAdminActionSchema = z.object({
  action: z.enum(['resume', 'archive', 'restore', 'purge']),
  reason: z.string().trim().min(1).max(1000),
  requestId: z.string().uuid(),
  revision: z.string().regex(/^[a-f0-9]{32}$/),
  confirmText: z.string().default(''),
  mistakenPaymentConfirmed: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (value.action === 'purge' && (!value.confirmText.trim() || !value.mistakenPaymentConfirmed)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '오등록 삭제 대상과 잘못 입력한 결제임을 확인해 주세요.' })
  }
})

export type EnrollmentAdminAction = z.infer<typeof enrollmentAdminActionSchema>['action']
export type EnrollmentAdminPreview = {
  enrollmentId: number; courseId: number; courseName: string; name: string; examNumber: string
  status: string; archived: boolean; paymentCount: number; paymentAmount: number
  canPurge: boolean; revision: string
}
