import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ScoreEntry } from "./score-entry";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export type ScoreRow = {
  registrationId: string;
  examNumber: string | null;
  externalName: string | null;
  externalPhone: string | null;
  division: string;
  seatNumber: string | null;
  studentName: string | null;
  studentMobile: string | null;
  score: number | null;
  rank: number | null;
  note: string | null;
};

const DIVISION_LABEL: Record<string, string> = {
  GONGCHAE_M: "공채 남",
  GONGCHAE_F: "공채 여",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

export default async function ExternalExamScoresPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;
  const prisma = getPrisma();

  const event = await prisma.examEvent.findUnique({
    where: { id },
    include: {
      registrations: {
        where: { cancelledAt: null },
        orderBy: [{ division: "asc" }, { registeredAt: "asc" }],
        include: {
          student: {
            select: { examNumber: true, name: true, phone: true },
          },
          score: {
            select: { score: true, rank: true, note: true },
          },
        },
      },
    },
  });

  if (!event || event.eventType !== ExamEventType.EXTERNAL) notFound();

  const rows: ScoreRow[] = event.registrations.map((reg) => ({
    registrationId: reg.id,
    examNumber: reg.examNumber,
    externalName: reg.externalName,
    externalPhone: reg.externalPhone,
    division: reg.division,
    seatNumber: reg.seatNumber,
    studentName: reg.student?.name ?? null,
    studentMobile: reg.student?.phone ?? null,
    score: reg.score?.score ?? null,
    rank: reg.score?.rank ?? null,
    note: reg.score?.note ?? null,
  }));

  const scoredCount = rows.filter((r) => r.score !== null).length;

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/exams/external" className="hover:text-forest">
          외부모의고사
        </Link>
        <span>/</span>
        <Link href={`/admin/exams/external/${id}`} className="hover:text-forest">
          {event.title}
        </Link>
        <span>/</span>
        <span className="text-ink">성적 입력</span>
      </nav>

      {/* Header */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-[#C55A11]/20 bg-[#C55A11]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#C55A11]">
            성적 입력
          </div>
          <h1 className="mt-5 text-3xl font-semibold">{event.title}</h1>
          <p className="mt-4 text-sm leading-7 text-slate">
            {new Date(event.examDate).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {event.venue && ` · ${event.venue}`}
            {" · "}총 {rows.length}명 접수
            {scoredCount > 0 && ` · 성적 입력 ${scoredCount}명`}
          </p>
        </div>
        <Link
          href={`/admin/exams/external/${id}`}
          className="inline-flex items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          ← 상세보기
        </Link>
      </div>

      {/* Division legend */}
      <div className="mt-6 flex flex-wrap gap-3">
        {Array.from(new Set(rows.map((r) => r.division))).map((div) => {
          const count = rows.filter((r) => r.division === div).length;
          const scored = rows.filter((r) => r.division === div && r.score !== null).length;
          return (
            <div
              key={div}
              className="rounded-[20px] border border-ink/10 bg-white px-4 py-2 text-sm shadow-sm"
            >
              <span className="font-semibold text-ink">{DIVISION_LABEL[div] ?? div}</span>
              <span className="ml-2 text-slate">
                {scored}/{count}명 입력
              </span>
            </div>
          );
        })}
      </div>

      {/* Score Entry Table */}
      <div className="mt-6">
        <ScoreEntry
          eventId={id}
          eventTitle={event.title}
          initialRows={rows}
          divisionLabel={DIVISION_LABEL}
        />
      </div>
    </div>
  );
}
