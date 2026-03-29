import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { listScheduledPaymentReminderTargets } from "@/lib/notifications/payment-reminders";
import { SendReminderButton } from "./send-reminder-button";

export const dynamic = "force-dynamic";

type EnrollmentSummary = {
  id: string;
  courseType: string;
  status: string;
  label: string;
};

type ReminderItem = {
  id: string;
  paymentId: string;
  seq: number;
  amount: number;
  dueDate: string;
  overdueDays: number;
  payment: {
    id: string;
    examNumber: string | null;
    netAmount: number;
    note: string | null;
    student: {
      name: string;
      phone: string | null;
      notificationConsent: boolean;
    } | null;
    firstItemName: string | null;
    enrollments: string[];
  };
};

type ScheduledPreviewItem = ReminderItem & {
  scheduleKey: "d-3" | "d-1" | "d-day";
};

function getScheduleMeta(scheduleKey: ScheduledPreviewItem["scheduleKey"]) {
  switch (scheduleKey) {
    case "d-3":
      return {
        shortLabel: "D-3",
        title: "\uB0A9\uBD80 3\uC77C \uC804",
        description: "\uC0AC\uC804 \uC548\uB0B4 \uB300\uC0C1",
        className: "text-sky-700 font-semibold",
      };
    case "d-1":
      return {
        shortLabel: "D-1",
        title: "\uB0A9\uBD80 \uC804\uC77C",
        description: "\uB9C8\uAC10 \uC804\uC77C \uC548\uB0B4",
        className: "text-amber-700 font-semibold",
      };
    default:
      return {
        shortLabel: "D-Day",
        title: "\uB2F9\uC77C \uB9C8\uAC10",
        description: "\uC624\uB298 \uB0A9\uBD80 \uD544\uC218 \uB300\uC0C1",
        className: "text-ember font-semibold",
      };
  }
}

function canSendReminder(item: ReminderItem): boolean {
  return Boolean(item.payment.examNumber && item.payment.student?.notificationConsent && item.payment.student?.phone);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}\uC6D0`;
}

function getDueDayLabel(overdueDays: number): { label: string; className: string } {
  if (overdueDays > 0) {
    return {
      label: `${overdueDays}\uC77C \uC5F0\uCC28`,
      className: "text-red-600 font-semibold",
    };
  }
  if (overdueDays === 0) {
    return { label: "\uC624\uB298 \uB9C8\uAC10", className: "text-amber-700 font-semibold" };
  }
  return { label: `D-${Math.abs(overdueDays)}`, className: "text-slate" };
}

function buildEnrollmentLabel(enrollment: {
  courseType: string;
  status: string;
  cohort: { name: string | null } | null;
  product: { name: string } | null;
  specialLecture: { name: string | null } | null;
}): string {
  const base =
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    (enrollment.courseType === "SPECIAL_LECTURE" ? "\uD2B9\uAC15" : "\uC885\uD569\uBC18");

  if (enrollment.status === "CANCELLED") {
    return `${base} \u00B7 \uCDE8\uC18C`;
  }

  return base;
}

function summarizeEnrollments(enrollments: EnrollmentSummary[]): string[] {
  if (enrollments.length === 0) return [];
  const labels = enrollments
    .slice(0, 2)
    .map((enrollment) => enrollment.label)
    .filter(Boolean);
  if (enrollments.length > 2) {
    labels.push(`\uC678 ${enrollments.length - 2}\uAC74`);
  }
  return labels;
}

export default async function InstallmentRemindersPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const sevenDaysLater = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thisWeekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const installments = await prisma.installment.findMany({
    where: {
      paidAt: null,
      dueDate: { lte: sevenDaysLater },
    },
    include: {
      payment: {
        select: {
          id: true,
          examNumber: true,
          netAmount: true,
          note: true,
          student: {
            select: {
              name: true,
              phone: true,
              notificationConsent: true,
              courseEnrollments: {
                select: {
                  id: true,
                  courseType: true,
                  status: true,
                  cohort: { select: { name: true } },
                  product: { select: { name: true } },
                  specialLecture: { select: { name: true } },
                },
                orderBy: [{ createdAt: "asc" }],
              },
            },
          },
          items: { select: { itemName: true }, take: 1 },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
    take: 200,
  });

  const [thisWeekCount, d7Count, overdueCount] = await Promise.all([
    prisma.installment.count({
      where: {
        paidAt: null,
        dueDate: { gte: todayStart, lte: thisWeekEnd },
      },
    }),
    prisma.installment.count({
      where: {
        paidAt: null,
        dueDate: { gte: todayStart, lte: sevenDaysLater },
      },
    }),
    prisma.installment.count({
      where: { paidAt: null, dueDate: { lt: todayStart } },
    }),
  ]);

  const items: ReminderItem[] = installments.map((item) => {
    const due = item.dueDate;
    const overdueDays =
      due < todayStart
        ? Math.round((todayStart.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
        : -Math.round((due.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

    const enrollments = item.payment.student?.courseEnrollments ?? [];
    const enrollmentSummaries: EnrollmentSummary[] = enrollments.map((enrollment) => ({
      id: enrollment.id,
      courseType: enrollment.courseType,
      status: enrollment.status,
      label: buildEnrollmentLabel(enrollment),
    }));

    return {
      id: item.id,
      paymentId: item.paymentId,
      seq: item.seq,
      amount: item.amount,
      dueDate: formatDate(due),
      overdueDays,
      payment: {
        id: item.payment.id,
        examNumber: item.payment.examNumber,
        netAmount: item.payment.netAmount,
        note: item.payment.note,
        student: item.payment.student ?? null,
        firstItemName: item.payment.items[0]?.itemName ?? null,
        enrollments: summarizeEnrollments(enrollmentSummaries),
      },
    };
  });

  const overdueItems = items
    .filter((item) => item.overdueDays > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays);
  const upcomingItems = items
    .filter((item) => item.overdueDays <= 0)
    .sort((a, b) => a.overdueDays - b.overdueDays);

  const scheduledTargets = await listScheduledPaymentReminderTargets(now);
  const scheduledTargetMap = new Map(items.map((item) => [item.id, item] as const));
  const scheduledPreviewItems: ScheduledPreviewItem[] = scheduledTargets
    .map((target) => {
      const item = scheduledTargetMap.get(target.installmentId);
      return item ? { ...item, scheduleKey: target.scheduleKey } : null;
    })
    .filter((item): item is ScheduledPreviewItem => item !== null)
    .sort((a, b) => {
      const order: Record<ScheduledPreviewItem["scheduleKey"], number> = {
        "d-day": 0,
        "d-1": 1,
        "d-3": 2,
      };
      return order[a.scheduleKey] - order[b.scheduleKey] || a.overdueDays - b.overdueDays;
    });
  const scheduledPreviewCounts = {
    dDay: scheduledPreviewItems.filter((item) => item.scheduleKey === "d-day").length,
    d1: scheduledPreviewItems.filter((item) => item.scheduleKey === "d-1").length,
    d3: scheduledPreviewItems.filter((item) => item.scheduleKey === "d-3").length,
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        \uBD84\uD560 \uB0A9\uBD80 \uC54C\uB9BC
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">\uBD84\uD560 \uB0A9\uBD80 \uC54C\uB9BC \uD604\uD669</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            \uC5F0\uCC28 \uD56D\uBAA9\uACFC 7\uC77C \uC774\uB0B4 \uB9C8\uAC10 \uC608\uC815 \uD56D\uBAA9\uC744 \uD655\uC778\uD558\uACE0,
            \uD559\uC0DD\uC5D0\uAC8C \uBBF8\uB0A9 \uC548\uB0B4\uB97C \uBC14\uB85C \uBCF4\uB0BC \uC218 \uC788\uC2B5\uB2C8\uB2E4.
          </p>
        </div>
        <Link
          href="/admin/payments/installments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; \uBD84\uD560 \uAD00\uB9AC\uB85C
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-sky-600">
            \uC774\uBC88 \uC8FC \uB9C8\uAC10
          </p>
          <p className="mt-2 text-3xl font-semibold text-sky-700">{thisWeekCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-sky-500">\uAC74</p>
        </div>

        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-600">
            D-7 \uC774\uB0B4 \uC608\uC815
          </p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">{d7Count.toLocaleString()}</p>
          <p className="mt-1 text-xs text-amber-500">\uAC74</p>
        </div>

        <div
          className={[
            "rounded-[28px] p-6 shadow-sm",
            overdueCount > 0 ? "border border-red-200 bg-red-50" : "border border-ink/10 bg-white",
          ].join(" ")}
        >
          <p
            className={[
              "text-xs font-medium uppercase tracking-widest",
              overdueCount > 0 ? "text-red-600" : "text-slate",
            ].join(" ")}
          >
            \uC5F0\uCC28 \uC911
          </p>
          <p
            className={[
              "mt-2 text-3xl font-semibold",
              overdueCount > 0 ? "text-red-700" : "text-ink",
            ].join(" ")}
          >
            {overdueCount.toLocaleString()}
          </p>
          <p className={["mt-1 text-xs", overdueCount > 0 ? "text-red-500" : "text-slate"].join(" ")}>
            \uAC74
          </p>
        </div>
      </div>

      <section className="mt-10 rounded-[32px] border border-forest/15 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">{"\uC624\uB298 \uC790\uB3D9 \uBC1C\uC1A1 \uD504\uB9AC\uBDF0"}</h2>
            <p className="mt-1 text-sm text-slate">
              {"cron\uC774 \uC624\uB298 \uCC98\uB9AC\uD560 D-3, D-1, \uB2F9\uC77C \uB300\uC0C1\uC785\uB2C8\uB2E4. \uC218\uB3D9 \uBC1C\uC1A1 \uC804\uC5D0 \uB300\uC0C1\uACFC \uC5F0\uB77D\uCC98\u00B7\uC218\uAC15\uB0B4\uC5ED\uC744 \uBA3C\uC800 \uD655\uC778\uD558\uC138\uC694."}
            </p>
          </div>
          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
            {`${scheduledPreviewItems.length}\uAC74`}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              key: "d-day",
              count: scheduledPreviewCounts.dDay,
              title: "\uB2F9\uC77C \uB9C8\uAC10",
              description: "\uC624\uB298 \uC790\uB3D9 \uBC1C\uC1A1 \uB300\uC0C1",
              className: "border-ember/20 bg-ember/5 text-ember",
            },
            {
              key: "d-1",
              count: scheduledPreviewCounts.d1,
              title: "D-1 \uC804\uC77C \uC548\uB0B4",
              description: "\uB0B4\uC77C \uB9C8\uAC10 \uC608\uC815",
              className: "border-amber-200 bg-amber-50 text-amber-700",
            },
            {
              key: "d-3",
              count: scheduledPreviewCounts.d3,
              title: "D-3 \uC0AC\uC804 \uC548\uB0B4",
              description: "3\uC77C \uC804 \uC608\uC815 \uB300\uC0C1",
              className: "border-sky-200 bg-sky-50 text-sky-700",
            },
          ].map((card) => (
            <div key={card.key} className={`rounded-[24px] border px-5 py-4 ${card.className}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">{card.title}</p>
              <p className="mt-2 text-3xl font-semibold">{card.count.toLocaleString()}</p>
              <p className="mt-1 text-xs opacity-80">{card.description}</p>
            </div>
          ))}
        </div>

        {scheduledPreviewItems.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-dashed border-ink/10 bg-mist/40 px-5 py-6 text-sm text-slate">
            {"\uC624\uB298 \uC790\uB3D9 \uBC1C\uC1A1 \uC608\uC815 \uB300\uC0C1\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/5 bg-mist/40">
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uD559\uC0DD"}</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uD559\uBC88"}</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uC5F0\uB77D\uCC98"}</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uC218\uAC15\uB0B4\uC5ED"}</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uAC15\uC88C"}</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uB0A9\uBD80 \uAE30\uD55C"}</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uC790\uB3D9 \uC2A4\uCF00\uC904"}</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uBC1C\uC1A1 \uAC00\uB2A5"}</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uC0C1\uC138"}</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">{"\uC218\uB3D9 \uBC1C\uC1A1"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {scheduledPreviewItems.map((item) => {
                  const scheduleMeta = getScheduleMeta(item.scheduleKey);
                  const canSend = canSendReminder(item);

                  return (
                    <tr key={`preview-${item.id}`} className="transition hover:bg-mist/30">
                      <td className="px-5 py-4">
                        {item.payment.examNumber ? (
                          <Link
                            href={`/admin/students/${item.payment.examNumber}`}
                            className="font-medium text-ink hover:text-ember hover:underline"
                          >
                            {item.payment.student?.name ?? "-"}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">{item.payment.student?.name ?? "-"}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate">{item.payment.examNumber ?? "\uD559\uBC88 \uC5C6\uC74C"}</td>
                      <td className="px-5 py-4 text-slate">{item.payment.student?.phone ?? "-"}</td>
                      <td className="px-5 py-4">
                        {item.payment.enrollments.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {item.payment.enrollments.map((enrollment) => (
                              <span
                                key={`preview-${item.id}-${enrollment}`}
                                className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[11px] font-medium text-slate"
                              >
                                {enrollment}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate">{"\uC218\uAC15\uB0B4\uC5ED \uC5C6\uC74C"}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate">
                        <div>{item.payment.firstItemName ?? "-"}</div>
                        <div className="text-xs text-slate/70">{`${item.seq}\uD68C\uCC28 / ${formatKRW(item.amount)}`}</div>
                      </td>
                      <td className="px-5 py-4 text-slate">{item.dueDate}</td>
                      <td className="px-5 py-4">
                        <div className={scheduleMeta.className}>{scheduleMeta.shortLabel}</div>
                        <div className="mt-0.5 text-xs text-slate">{scheduleMeta.description}</div>
                      </td>
                      <td className="px-5 py-4">
                        {canSend ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                            {"\uBC1C\uC1A1 \uAC00\uB2A5"}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-slate/20 bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                            {"\uB3D9\uC758/\uC5F0\uB77D\uCC98 \uD655\uC778 \uD544\uC694"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/payments/installments/${item.id}`}
                          className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink transition hover:border-ember/40 hover:text-ember"
                        >
                          {"\uC0C1\uC138\uBCF4\uAE30"}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <SendReminderButton
                          installmentId={item.id}
                          studentName={item.payment.student?.name ?? "\uD559\uC0DD"}
                          disabled={!canSend}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {overdueItems.length > 0 ? (
        <section className="mt-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-ink">\uAE30\uD55C \uCD08\uACFC \uBD84\uD560 \uB0A9\uBD80</h2>
            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              {overdueItems.length}\uAC74
            </span>
          </div>
          <p className="mt-1 text-sm text-slate">
            \uB0A9\uBD80 \uAE30\uD55C\uC774 \uC9C0\uB09C \uBD84\uD560 \uD56D\uBAA9\uC785\uB2C8\uB2E4. \uD544\uC694\uD558\uBA74 \uC989\uC2DC \uC54C\uB9BC\uC744 \uBC1C\uC1A1\uD558\uC138\uC694.
          </p>

          <div className="mt-5 overflow-x-auto rounded-[28px] border border-red-200 bg-white shadow-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-red-100 bg-red-50/60">
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uD559\uC0DD</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uD559\uBC88</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uC5F0\uB77D\uCC98</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uC218\uAC15\uB0B4\uC5ED</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uAC15\uC88C</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uBBF8\uB0A9 \uD68C\uCC28</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uB0A9\uBD80 \uAE30\uD55C</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uC5F0\uCC28</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uB3D9\uC758</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uC0C1\uC138</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uC54C\uB9BC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {overdueItems.map((item) => {
                  const dueLabel = getDueDayLabel(item.overdueDays);
                  const canSend = canSendReminder(item);

                  return (
                    <tr key={item.id} className="transition hover:bg-red-50/30">
                      <td className="px-5 py-4">
                        {item.payment.examNumber ? (
                          <Link
                            href={`/admin/students/${item.payment.examNumber}`}
                            className="font-medium text-ink hover:text-ember hover:underline"
                          >
                            {item.payment.student?.name ?? "-"}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">{item.payment.student?.name ?? "-"}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate">{item.payment.examNumber ?? "\uD559\uBC88 \uC5C6\uC74C"}</td>
                      <td className="px-5 py-4 text-slate">{item.payment.student?.phone ?? "-"}</td>
                      <td className="px-5 py-4">
                        {item.payment.enrollments.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {item.payment.enrollments.map((enrollment) => (
                              <span
                                key={enrollment}
                                className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[11px] font-medium text-slate"
                              >
                                {enrollment}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate">\uC218\uAC15\uB0B4\uC5ED \uC5C6\uC74C</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate">
                        <div>{item.payment.firstItemName ?? "-"}</div>
                        <div className="text-xs text-slate/70">
                          {item.seq}\uD68C\uCC28 / \uD569\uACC4 {formatKRW(item.payment.netAmount)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate">{item.dueDate}</td>
                      <td className="px-5 py-4">
                        <span className={dueLabel.className}>{dueLabel.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        {item.payment.student?.notificationConsent ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                            \uB3D9\uC758
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-slate/20 bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                            \uBBF8\uB3D9\uC758
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/payments/installments/${item.id}`}
                          className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink transition hover:border-ember/40 hover:text-ember"
                        >
                          \uC0C1\uC138\uBCF4\uAE30
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <SendReminderButton
                          installmentId={item.id}
                          studentName={item.payment.student?.name ?? "\uD559\uC0DD"}
                          disabled={!canSend}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {upcomingItems.length > 0 ? (
        <section className="mt-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-ink">D-7 \uC774\uB0B4 \uB9C8\uAC10 \uC608\uC815</h2>
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              {upcomingItems.length}\uAC74
            </span>
          </div>
          <p className="mt-1 text-sm text-slate">
            7\uC77C \uC774\uB0B4\uC5D0 \uB9C8\uAC10\uB418\uB294 \uBD84\uD560 \uB0A9\uBD80 \uD56D\uBAA9\uC785\uB2C8\uB2E4. \uC0AC\uC804 \uC548\uB0B4\uAC00 \uD544\uC694\uD55C \uAC74\uC744 \uBAA8\uB450 \uD655\uC778\uD558\uC138\uC694.
          </p>

          <div className="mt-5 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/5 bg-mist/40">
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uD559\uC0DD</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uD559\uBC88</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uC5F0\uB77D\uCC98</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uC218\uAC15\uB0B4\uC5ED</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uAC15\uC88C</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uBBF8\uB0A9 \uD68C\uCC28</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">D-Day</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uB3D9\uC758</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uC0C1\uC138</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">\uC54C\uB9BC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {upcomingItems.map((item) => {
                  const dueLabel = getDueDayLabel(item.overdueDays);
                  const canSend = canSendReminder(item);

                  return (
                    <tr key={item.id} className="transition hover:bg-mist/30">
                      <td className="px-5 py-4">
                        {item.payment.examNumber ? (
                          <Link
                            href={`/admin/students/${item.payment.examNumber}`}
                            className="font-medium text-ink hover:text-ember hover:underline"
                          >
                            {item.payment.student?.name ?? "-"}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">{item.payment.student?.name ?? "-"}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate">{item.payment.examNumber ?? "\uD559\uBC88 \uC5C6\uC74C"}</td>
                      <td className="px-5 py-4 text-slate">{item.payment.student?.phone ?? "-"}</td>
                      <td className="px-5 py-4">
                        {item.payment.enrollments.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {item.payment.enrollments.map((enrollment) => (
                              <span
                                key={enrollment}
                                className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[11px] font-medium text-slate"
                              >
                                {enrollment}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate">\uC218\uAC15\uB0B4\uC5ED \uC5C6\uC74C</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate">
                        <div>{item.payment.firstItemName ?? "-"}</div>
                        <div className="text-xs text-slate/70">
                          {item.seq}\uD68C\uCC28 / \uD569\uACC4 {formatKRW(item.payment.netAmount)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate">{item.dueDate}</td>
                      <td className="px-5 py-4">
                        <span className={dueLabel.className}>{dueLabel.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        {item.payment.student?.notificationConsent ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                            \uB3D9\uC758
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-slate/20 bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                            \uBBF8\uB3D9\uC758
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/payments/installments/${item.id}`}
                          className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink transition hover:border-ember/40 hover:text-ember"
                        >
                          \uC0C1\uC138\uBCF4\uAE30
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <SendReminderButton
                          installmentId={item.id}
                          studentName={item.payment.student?.name ?? "\uD559\uC0DD"}
                          disabled={!canSend}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-ink/10 bg-white p-12 text-center shadow-panel">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest/10">
            <svg className="h-7 w-7 text-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-ink">
            \uBC1C\uC1A1\uD560 \uBBF8\uB0A9 \uC54C\uB9BC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4
          </h3>
          <p className="mt-2 text-sm text-slate">
            \uC5F0\uCC28 \uBD84\uD560 \uB610\uB294 7\uC77C \uC774\uB0B4 \uB9C8\uAC10 \uC608\uC815\uC778 \uBD84\uD560 \uB0A9\uBD80\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.
          </p>
        </div>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/admin/payments/installments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; \uBD84\uD560 \uAD00\uB9AC\uB85C
        </Link>
        <Link
          href="/admin/payments/installments/calendar"
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/5 px-5 py-2.5 text-sm font-medium text-ember transition hover:bg-ember/10"
        >
          \uB2EC\uB825 \uBCF4\uAE30
        </Link>
      </div>
    </div>
  );
}
