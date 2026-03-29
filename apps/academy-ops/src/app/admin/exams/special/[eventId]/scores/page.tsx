import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, ExamDivision } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SpecialScoreEntryClient } from "./score-entry-client";

export const dynamic = "force-dynamic";

const DIVISION_LABEL: Record<ExamDivision, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export type SpecialRegistrationWithScore = {
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

export type SpecialDivisionGroup = {
  division: ExamDivision;
  label: string;
  registrations: SpecialRegistrationWithScore[];
};

export default async function SpecialExamScoresPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

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

  // 통계 계산
  const allScores = event.registrations
    .filter((r) => r.score !== null)
    .map((r) => r.score!.score);
  const scoredCount = allScores.length;
  const totalCount = event.registrations.length;
  const scoreAvg =
    scoredCount > 0
      ? Math.round((allScores.reduce((s, v) => s + v, 0) / scoredCount) * 10) / 10
      : null;
  const scoreMax = scoredCount > 0 ? Math.max(...allScores) : null;
  const passCount = allScores.filter((s) => s >= 60).length;
  const passRate =
    scoredCount > 0 ? Math.round((passCount / scoredCount) * 1000) / 10 : null;

  // Group by division
  const groupMap = new Map<ExamDivision, SpecialRegistrationWithScore[]>();
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

  const divisionGroups: SpecialDivisionGroup[] = Object.values(ExamDivision)
    .map((d) => ({
      division: d,
      label: DIVISION_LABEL[d],
      registrations: groupMap.get(d) ?? [],
    }))
    .filter((g) => g.registrations.length > 0);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/exams/special" className="transition hover:text-ink">
          특강모의고사
        </Link>
        <span>/</span>
        <Link
          href={`/admin/exams/special/${eventId}`}
          className="transition hover:text-ink"
        >
          {event.title}
        </Link>
        <span>/</span>
        <span className="text-ink">성적 관리</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          특강모의고사 — 성적 관리
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">
          성적 입력 — {event.title}
        </h1>
        <p className="mt-2 text-sm text-slate">
          시험일: {event.examDate.toISOString().slice(0, 10)}&nbsp;·&nbsp;접수
          인원: {totalCount}명
        </p>
      </div>

      {/* Score statistics (if any scores exist) */}
      {scoredCount > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
              성적 입력
            </p>
            <p className="mt-3 text-2xl font-bold text-ink">
              {scoredCount}
              <span className="ml-1 text-sm font-normal text-slate">
                / {totalCount}명
              </span>
            </p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
              평균 점수
            </p>
            <p className="mt-3 text-2xl font-bold text-ember">{scoreAvg}점</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
              최고 점수
            </p>
            <p className="mt-3 text-2xl font-bold text-ink">{scoreMax}점</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
              합격률(60점↑)
            </p>
            <p
              className={`mt-3 text-2xl font-bold ${
                (passRate ?? 0) >= 80
                  ? "text-forest"
                  : (passRate ?? 0) >= 60
                    ? "text-ink"
                    : "text-amber-600"
              }`}
            >
              {passRate}%
              <span className="ml-1 text-sm font-normal text-slate">
                ({passCount}명)
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Score Entry */}
      {divisionGroups.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-16 text-center text-sm text-slate">
          접수된 수험생이 없습니다.
          <br />
          <Link
            href={`/admin/exams/special/${eventId}`}
            className="mt-3 inline-block text-ember underline"
          >
            시험 상세로 이동
          </Link>
        </div>
      ) : (
        <SpecialScoreEntryClient
          eventId={eventId}
          divisionGroups={divisionGroups}
        />
      )}
    </div>
  );
}
