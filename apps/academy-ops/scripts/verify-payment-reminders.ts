import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NotificationType } from '@prisma/client';
import { GET as getPaymentRemindersRoute } from '../src/app/api/cron/payment-reminders/route';
import { buildPaymentReminderDedupeKey } from '../src/lib/notifications/payment-reminders';
import { buildNotificationTemplateValues } from '../src/lib/notifications/templates';

async function main() {
  const dedupeKey = buildPaymentReminderDedupeKey({
    examNumber: '2605001',
    enrollmentId: 'enrollment-1',
    installmentId: 'installment-1',
    scheduleKey: 'd-3',
    dueDate: '2026-03-22',
  });

  assert.match(dedupeKey, /^payment-overdue:/);
  assert.match(dedupeKey, /installment:installment-1/);
  assert.match(dedupeKey, /d-3/);
  assert.match(dedupeKey, /2026-03-22/);

  const values = buildNotificationTemplateValues({
    type: NotificationType.PAYMENT_OVERDUE,
    studentName: '\uD64D\uAE38\uB3D9',
    courseName: '\uC885\uD569\uBC18',
    unpaidAmount: '200,000\uC6D0',
    dueDate: '2026.03.22',
  });

  assert.equal(values.studentName, '\uD64D\uAE38\uB3D9');
  assert.equal(values.courseName, '\uC885\uD569\uBC18');
  assert.equal(values.unpaidAmount, '200,000\uC6D0');
  assert.equal(values.dueDate, '2026.03.22');

  const vercelConfig = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  assert.ok(
    vercelConfig.crons?.some((cron) => cron.path === '/api/cron/payment-reminders'),
    'payment reminder cron path missing from vercel.json',
  );

  const originalSecret = process.env.CRON_SECRET;

  try {
    delete process.env.CRON_SECRET;
    let response = await getPaymentRemindersRoute(new Request('http://localhost/api/cron/payment-reminders'));
    assert.equal(response.status, 503);

    process.env.CRON_SECRET = 'payment-reminder-secret';
    response = await getPaymentRemindersRoute(new Request('http://localhost/api/cron/payment-reminders'));
    assert.equal(response.status, 401);

    response = await getPaymentRemindersRoute(
      new Request('http://localhost/api/cron/payment-reminders', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );
    assert.equal(response.status, 401);
  } finally {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  }

  console.log('verify:payment-reminders ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
