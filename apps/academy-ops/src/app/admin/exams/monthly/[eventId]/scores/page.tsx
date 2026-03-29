import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, ExamDivision } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ScoreEntryClient } from "./score-entry-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export type RegistrationWithScore = {
  id: string;
  examNumber: string | null;
  externalName: string | null;
  division: ExamDivision;
  seatNumber: string | null;
  student: {
    examNumber: string;
    name: string;
    phone: string | null;
  } | null;
  score: {
    id: string;
    score: number;
    rank: number | null;
  } | null;
};

export type DivisionGroup = {
  division: ExamDivision;
  label: string;
  registrations: RegistrationWithScore[];
};

const DIVISION_LABEL: Record<ExamDivision, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

export default async function MonthlyScoresPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { eventId } = await params;
  const prisma = getPrisma();

  const event = await prisma.examEvent.findUnique({
    where: { id: eventId },
    include: {
      registrations: {
        where: { cancelledAt: null },
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
            },
          },
          score: {
            select: {
              id: true,
              score: true,
              rank: true,
            },
          },
        },
        orderBy: [{ division: "asc" }, { registeredAt: "asc" }],
      },
    },
  });

  if (!event) notFound();

  // Group by division
  const groupMap = new Map<ExamDivision, RegistrationWithScore[]>();
  for (const div of Object.values(ExamDivision)) {
    groupMap.set(div, []);
  }

  for (const reg of event.registrations) {
    const list = groupMap.get(reg.division);
    if (list) {
      list.push({
        id: reg.id,
        examNumber: reg.examNumber,
        externalName: reg.externalName,
        division: reg.division,
        seatNumber: reg.seatNumber,
        student: reg.student
          ? {
              examNumber: reg.student.examNumber,
              name: reg.student.name,
              phone: reg.student.phone ?? null,
            }
          : null,
        score: reg.score
          ? {
              id: reg.score.id,
              score: reg.score.score,
              rank: reg.score.rank ?? null,
            }
          : null,
      });
    }
  }

  const divisionGroups: DivisionGroup[] = Object.values(ExamDivision)
    .map((d) => ({
      division: d,
      label: DIVISION_LABEL[d],
      registrations: groupMap.get(d) ?? [],
    }))
    .filter((g) => g.registrations.length > 0);

  return (
    <div className="p-8 sm:p-10">
      {/* Back */}
      <div className="mb-6 flex items-center gap-2">
        <Link
          href={`/admin/exams/monthly/${eventId}`}
          className="text-sm text-slate transition hover:text-ink"
        >
          &larr; 시험 상세로 돌아가기
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          월말평가
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">
          성적 입력 — {event.title}
        </h1>
        <p className="mt-2 text-sm text-slate">
          시험일: {event.examDate.toISOString().slice(0, 10)} &nbsp;·&nbsp; 접수
          인원: {event.registrations.length}명
        </p>
      </div>

      {/* Score Entry Client */}
      {divisionGroups.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-16 text-center text-sm text-slate">
          접수된 수험생이 없습니다.
          <br />
          <Link
            href={`/admin/exams/monthly/${eventId}`}
            className="mt-3 inline-block text-ember underline"
          >
            접수 페이지로 이동
          </Link>
        </div>
      ) : (
        <ScoreEntryClient
          eventId={eventId}
          divisionGroups={divisionGroups}
        />
      )}
    </div>
  );
}
