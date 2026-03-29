import Link from "next/link";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { MonthlyExamManager } from "./monthly-exam-manager";

export const dynamic = "force-dynamic";

export type ExamEventRow = {
  id: string;
  title: string;
  eventType: ExamEventType;
  examDate: string;
  registrationFee: number;
  registrationDeadline: string | null;
  venue: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { registrations: number };
};

export default async function MonthlyExamPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const events = await getPrisma().examEvent.findMany({
    where: { eventType: ExamEventType.MONTHLY },
    orderBy: { examDate: "desc" },
    include: { _count: { select: { registrations: true } } },
  });

  const rows: ExamEventRow[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.eventType,
    examDate: e.examDate.toISOString(),
    registrationFee: e.registrationFee,
    registrationDeadline: e.registrationDeadline?.toISOString() ?? null,
    venue: e.venue,
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
    _count: e._count,
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            Exam Registration
          </div>
          <h1 className="mt-5 text-3xl font-semibold">월말평가 접수 관리</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            월말평가 시험을 등록하고 수강생 및 외부 수험생 접수를 처리합니다.
          </p>
        </div>
        <div className="mt-5 sm:mt-0 flex flex-shrink-0 items-center gap-3">
          <Link
            href="/admin/exams/monthly/results"
            className="inline-flex items-center gap-2 rounded-full border border-ember/30 px-5 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            결과 분석
          </Link>
          <Link
            href="/admin/exams/new"
            className="inline-flex items-center gap-2 rounded-full bg-[#C55A11] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 시험 등록
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <MonthlyExamManager initialEvents={rows} />
      </div>
    </div>
  );
}
