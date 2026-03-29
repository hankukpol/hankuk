import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/cron';
import { runPaymentReminderNotifications } from '@/lib/notifications/payment-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await runPaymentReminderNotifications();
  if (!result.ok && result.failed > 0) {
    return NextResponse.json({ error: result.message, data: result }, { status: 503 });
  }

  return NextResponse.json({ data: result });
}
