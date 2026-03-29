import Link from "next/link";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { RegistrationsClient } from "./registrations-client";
import type { RegistrationRow, ExamEventInfo } from "./registrations-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatExamDate(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export default async function ExternalExamRegistrationsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const prisma = getPrisma();

  const event = await prisma.examEvent.findFirst({
    where: { id, eventType: ExamEventType.EXTERNAL },
    select: {
      id: true,
      title: true,
      examDate: true,
      venue: true,
      registrationFee: true,
    },
  });

  if (!event) {
    notFound();
  }

  const registrations = await prisma.examRegistration.findMany({
    where: { examEventId: id, cancelledAt: null },
    orderBy: { registeredAt: "asc" },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
      score: { select: { id: true } },
    },
  });

  const eventInfo: ExamEventInfo = {
    id: event.id,
    title: event.title,
    examDate: event.examDate.toISOString(),
    venue: event.venue,
    registrationFee: event.registrationFee,
  };

  const rows: RegistrationRow[] = registrations.map((reg) => ({
    id: reg.id,
    examNumber: reg.examNumber,
    externalName: reg.externalName,
    externalPhone: reg.externalPhone,
    division: reg.division,
    isPaid: reg.isPaid,
    paidAmount: reg.paidAmount,
    paidAt: reg.paidAt?.toISOString() ?? null,
    seatNumber: reg.seatNumber,
    registeredAt: reg.registeredAt.toISOString(),
    student: reg.student
      ? {
          examNumber: reg.student.examNumber,
          name: reg.student.name,
          phone: reg.student.phone ?? null,
        }
      : null,
    hasScore: reg.score !== null,
  }));

  const examDateFormatted = formatExamDate(event.examDate);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-purple-700">
            External Exam
          </div>
          <h1 className="mt-5 text-3xl font-semibold">{event.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {examDateFormatted}
            </span>
            {event.venue && (
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {event.venue}
              </span>
            )}
            {event.registrationFee > 0 && (
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                참가비 {event.registrationFee.toLocaleString()}원
              </span>
            )}
          </div>
        </div>
        <Link
          href="/admin/exams/external"
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest sm:mt-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          외부모의고사 목록
        </Link>
      </div>

      <div className="mt-8">
        <RegistrationsClient event={eventInfo} initialRegistrations={rows} />
      </div>
    </div>
  );
}
