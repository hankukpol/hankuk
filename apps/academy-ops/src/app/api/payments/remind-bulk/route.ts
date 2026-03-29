import { AdminRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api-auth';
import { sendPaymentReminderNotification } from '@/lib/notifications/payment-reminders';

type RemindItem = {
  examNumber: string;
  enrollmentId?: string;
  unpaidAmount?: number;
  courseName?: string;
  dueDate?: string;
};

const TEXT = {
  noItems: '발송할 대상이 없습니다.',
  tooManyItems: '한 번에 최대 200건까지만 발송할 수 있습니다.',
  unexpected: '일괄 미납 안내 발송에 실패했습니다.',
} as const;

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { items } = body as { items: RemindItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: TEXT.noItems }, { status: 400 });
    }

    if (items.length > 200) {
      return NextResponse.json({ error: TEXT.tooManyItems }, { status: 400 });
    }

    const results = await Promise.all(
      items.map((item) =>
        sendPaymentReminderNotification({
          examNumber: item.examNumber,
          enrollmentId: item.enrollmentId ?? null,
          unpaidAmount: item.unpaidAmount ?? 0,
          courseName: item.courseName ?? null,
          dueDate: item.dueDate ?? null,
          scheduleKey: 'manual',
          adminId: auth.context.adminUser.id,
          ipAddress: request.headers.get('x-forwarded-for'),
          enforceOperatingHours: false,
        }),
      ),
    );

    return NextResponse.json({
      data: {
        sent: results.filter((result) => result.status === 'sent').length,
        skipped: results.filter((result) => result.status === 'skipped').length,
        failed: results.filter((result) => result.status === 'failed').length,
        errors: results.filter((result) => !result.ok).map((result) => result.message).slice(0, 20),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : TEXT.unexpected },
      { status: 400 },
    );
  }
}
