import { AdminRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api-auth';
import { getPrisma } from '@/lib/prisma';
import { sendPaymentReminderNotification } from '@/lib/notifications/payment-reminders';

export const dynamic = 'force-dynamic';

const TEXT = {
  installmentNotFound: '분할 항목을 찾을 수 없습니다.',
  alreadyPaid: '이미 납부 완료된 항목입니다.',
  studentNotFound: '학생 정보를 찾을 수 없습니다.',
  examNumberMissing: '학번 정보가 없습니다.',
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const prisma = getPrisma();

  const installment = await prisma.installment.findUnique({
    where: { id },
    include: {
      payment: {
        select: {
          examNumber: true,
          enrollmentId: true,
          items: { select: { itemName: true }, take: 1 },
          student: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!installment) {
    return NextResponse.json({ error: TEXT.installmentNotFound }, { status: 404 });
  }

  if (installment.paidAt) {
    return NextResponse.json({ error: TEXT.alreadyPaid }, { status: 409 });
  }

  if (!installment.payment.student) {
    return NextResponse.json({ error: TEXT.studentNotFound }, { status: 404 });
  }

  if (!installment.payment.examNumber) {
    return NextResponse.json({ error: TEXT.examNumberMissing }, { status: 404 });
  }

  const result = await sendPaymentReminderNotification({
    examNumber: installment.payment.examNumber,
    enrollmentId: installment.payment.enrollmentId,
    installmentId: installment.id,
    unpaidAmount: installment.amount,
    courseName: installment.payment.items[0]?.itemName ?? '수강료',
    dueDate: installment.dueDate,
    scheduleKey: 'manual-installment',
    adminId: auth.context.adminUser.id,
    ipAddress: request.headers.get('x-forwarded-for'),
    enforceOperatingHours: false,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.httpStatus });
  }

  return NextResponse.json({ data: { sent: true, message: result.message, dedupeKey: result.dedupeKey } });
}
