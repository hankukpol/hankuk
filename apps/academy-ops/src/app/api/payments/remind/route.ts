import { AdminRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api-auth';
import { sendPaymentReminderNotification } from '@/lib/notifications/payment-reminders';

const TEXT = {
  examNumberRequired: '학번을 입력해 주세요.',
  unexpected: '미납 안내 발송에 실패했습니다.',
} as const;

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { examNumber, enrollmentId, unpaidAmount, courseName, dueDate } = body as {
      examNumber: string;
      enrollmentId?: string;
      unpaidAmount?: number;
      courseName?: string;
      dueDate?: string;
    };

    if (!examNumber?.trim()) {
      return NextResponse.json({ error: TEXT.examNumberRequired }, { status: 400 });
    }

    const result = await sendPaymentReminderNotification({
      examNumber,
      enrollmentId: enrollmentId ?? null,
      unpaidAmount: unpaidAmount ?? 0,
      courseName: courseName ?? null,
      dueDate: dueDate ?? null,
      scheduleKey: 'manual',
      adminId: auth.context.adminUser.id,
      ipAddress: request.headers.get('x-forwarded-for'),
      enforceOperatingHours: false,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.httpStatus });
    }

    return NextResponse.json({ data: { sent: true, message: result.message, dedupeKey: result.dedupeKey } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : TEXT.unexpected },
      { status: 400 },
    );
  }
}
