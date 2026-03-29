import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function StageTag({ stage }: { stage: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    FIRST_VISIT: {
      label: "첫 방문",
      cls: "bg-blue-50 text-blue-700 border-blue-200",
    },
    INTERESTED: {
      label: "관심 있음",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    },
    FOLLOW_UP: {
      label: "재연락 예정",
      cls: "bg-violet-50 text-violet-700 border-violet-200",
    },
    ENROLLED: {
      label: "수강 등록",
      cls: "bg-forest/10 text-forest border-forest/20",
    },
    DROPPED: {
      label: "포기",
      cls: "bg-red-50 text-red-600 border-red-200",
    },
  };
  const config = map[stage] ?? {
    label: stage,
    cls: "bg-mist text-slate border-ink/10",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${config.cls}`}
    >
      {config.label}
    </span>
  );
}

function inferStage(
  content: string,
  recommendation: string | null,
): string {
  const combined = `${content} ${recommendation ?? ""}`.toLowerCase();
  if (combined.includes("등록") || combined.includes("수강 완료"))
    return "ENROLLED";
  if (combined.includes("포기") || combined.includes("취소")) return "DROPPED";
  if (combined.includes("재방문") || combined.includes("다음") || combined.includes("연락"))
    return "FOLLOW_UP";
  if (combined.includes("관심") || combined.includes("고려"))
    return "INTERESTED";
  return "FIRST_VISIT";
}

export default async function ConsultationDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const recordId = Number(id);

  if (!Number.isInteger(recordId) || recordId <= 0) {
    notFound();
  }

  const prisma = getPrisma();

  const record = await prisma.counselingRecord.findUnique({
    where: { id: recordId },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
          examType: true,
          currentStatus: true,
          isActive: true,
          courseEnrollments: {
            where: { status: { in: ["ACTIVE", "PENDING"] } },
            orderBy: { startDate: "desc" },
            take: 3,
            select: {
              id: true,
              courseType: true,
              status: true,
              startDate: true,
              endDate: true,
              product: { select: { name: true } },
              cohort: { select: { name: true } },
              specialLecture: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!record) {
    notFound();
  }

  // Fetch timeline: all counseling records for this student (including current)
  const timeline = await prisma.counselingRecord.findMany({
    where: { examNumber: record.examNumber },
    orderBy: { counseledAt: "asc" },
    select: {
      id: true,
      counseledAt: true,
      counselorName: true,
      content: true,
      recommendation: true,
      nextSchedule: true,
    },
  });

  const stage = inferStage(record.content, record.recommendation ?? null);
  const examTypeLabel =
    record.student.examType === "GONGCHAE" ? "공채" : "경채";

  const statusMap: Record<string, string> = {
    NORMAL: "재학",
    WARNING_1: "경고1",
    WARNING_2: "경고2",
    DROPOUT: "제적",
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin" className="transition hover:text-ink">
          홈
        </Link>
        <span>/</span>
        <Link href="/admin/consultations" className="transition hover:text-ink">
          상담 관리
        </Link>
        <span>/</span>
        <span className="text-ink">상담 상세</span>
      </nav>

      {/* Header */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            상담 상세
          </div>
          <h1 className="mt-4 text-3xl font-semibold">
            {record.student.name}
            <span className="ml-3 text-xl font-normal text-slate">
              {new Date(record.counseledAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              })}{" "}
              상담
            </span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate">
              학번 {record.examNumber} · 담당 {record.counselorName}
            </p>
            <StageTag stage={stage} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/enrollments/new?examNumber=${record.examNumber}`}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            수강 등록으로 전환
          </Link>
          <Link
            href={`/admin/counseling/${record.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            수정하기
          </Link>
          <Link
            href="/admin/consultations"
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            ← 목록으로
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_320px]">
        {/* Main */}
        <div className="space-y-6">
          {/* Student Card */}
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
              <h2 className="text-base font-semibold">학생 정보</h2>
              <Link
                href={`/admin/students/${record.examNumber}`}
                className="text-xs font-semibold text-ember hover:underline"
              >
                학생 상세 →
              </Link>
            </div>
            <dl className="divide-y divide-ink/10">
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  학번
                </dt>
                <dd className="text-sm text-ink">
                  <Link
                    href={`/admin/students/${record.examNumber}`}
                    className="font-semibold text-ember hover:underline"
                  >
                    {record.examNumber}
                  </Link>
                </dd>
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  이름
                </dt>
                <dd className="text-sm font-semibold text-ink">
                  <Link
                    href={`/admin/students/${record.examNumber}`}
                    className="transition hover:text-ember"
                  >
                    {record.student.name}
                  </Link>
                </dd>
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  연락처
                </dt>
                <dd className="text-sm text-ink">
                  {record.student.phone ?? "-"}
                </dd>
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  시험 유형
                </dt>
                <dd className="text-sm text-ink">{examTypeLabel}</dd>
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  재학 상태
                </dt>
                <dd className="text-sm text-ink">
                  {statusMap[record.student.currentStatus] ??
                    record.student.currentStatus}
                  {!record.student.isActive && (
                    <span className="ml-2 text-xs text-red-500">(비활성)</span>
                  )}
                </dd>
              </div>
              {/* Active enrollments */}
              {record.student.courseEnrollments.length > 0 && (
                <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                  <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                    수강 현황
                  </dt>
                  <dd className="space-y-1.5">
                    {record.student.courseEnrollments.map((e) => {
                      const courseName =
                        e.product?.name ??
                        e.cohort?.name ??
                        e.specialLecture?.name ??
                        (e.courseType === "COMPREHENSIVE"
                          ? "종합반"
                          : "특강");
                      return (
                        <div key={e.id} className="text-sm text-ink">
                          <span className="font-medium">{courseName}</span>
                          <span className="ml-2 text-xs text-slate">
                            {new Date(e.startDate).toLocaleDateString("ko-KR", {
                              month: "2-digit",
                              day: "2-digit",
                            })}
                            {e.endDate
                              ? ` ~ ${new Date(e.endDate).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}`
                              : ""}
                          </span>
                        </div>
                      );
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Consultation Details */}
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="border-b border-ink/10 px-6 py-4">
              <h2 className="text-base font-semibold">상담 내용</h2>
            </div>
            <dl className="divide-y divide-ink/10">
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  상담 일시
                </dt>
                <dd className="text-sm text-ink">
                  {new Date(record.counseledAt).toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  담당 직원
                </dt>
                <dd className="text-sm text-ink">{record.counselorName}</dd>
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  수강 의향 / 단계
                </dt>
                <dd>
                  <StageTag stage={stage} />
                </dd>
              </div>
              {record.nextSchedule && (
                <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                  <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                    다음 예정일
                  </dt>
                  <dd className="text-sm font-semibold text-ember">
                    {new Date(record.nextSchedule).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </dd>
                </div>
              )}
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  상담 내용
                </dt>
                <dd className="whitespace-pre-wrap text-sm leading-7 text-ink">
                  {record.content}
                </dd>
              </div>
              {record.recommendation && (
                <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                  <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                    관심 강좌 / 권고사항
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm leading-7 text-ink">
                    {record.recommendation}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Timeline */}
          <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-base font-semibold">
              상담 이력 ({timeline.length}건)
            </h2>
            <p className="mt-1 text-xs text-slate">
              동일 학생의 전체 상담 기록 (시간순)
            </p>

            {timeline.length === 0 ? (
              <p className="mt-4 text-sm text-slate">상담 기록이 없습니다.</p>
            ) : (
              <ol className="relative mt-6 ml-4 border-l border-ink/10">
                {timeline.map((r, idx) => {
                  const isCurrent = r.id === record.id;
                  return (
                    <li key={r.id} className="mb-6 ml-6 last:mb-0">
                      <span
                        className={`absolute -left-2 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white ${
                          isCurrent
                            ? "bg-ember"
                            : "bg-forest/20"
                        }`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <time className="text-xs font-medium text-slate">
                          {new Date(r.counseledAt).toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </time>
                        <span className="text-xs text-slate">
                          · {r.counselorName}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-ember/10 px-2 py-0.5 text-xs font-semibold text-ember">
                            현재
                          </span>
                        )}
                        {idx === timeline.length - 1 && !isCurrent && (
                          <span className="rounded-full bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                            최근
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-ink">
                        {r.content.slice(0, 80)}
                        {r.content.length > 80 ? "..." : ""}
                      </p>
                      {r.recommendation && (
                        <p className="mt-0.5 text-xs text-forest">
                          권고: {r.recommendation.slice(0, 50)}
                          {r.recommendation.length > 50 ? "..." : ""}
                        </p>
                      )}
                      {r.nextSchedule && (
                        <p className="mt-0.5 text-xs text-amber-600">
                          다음 예정:{" "}
                          {new Date(r.nextSchedule).toLocaleDateString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </p>
                      )}
                      {!isCurrent && (
                        <Link
                          href={`/admin/consultations/${r.id}`}
                          className="mt-1 inline-flex text-xs font-semibold text-ember hover:underline"
                        >
                          상세 보기 →
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="self-start space-y-4 xl:sticky xl:top-6">
          {/* Convert to enrollment */}
          <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6">
            <h2 className="text-base font-semibold">수강 등록 전환</h2>
            <p className="mt-2 text-sm text-slate">
              이 상담 내용을 바탕으로 학생의 수강 등록을 진행합니다.
            </p>
            <Link
              href={`/admin/enrollments/new?examNumber=${record.examNumber}`}
              className="mt-4 block w-full rounded-full bg-ember px-5 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              수강 등록 시작
            </Link>
          </div>

          {/* Quick links */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-base font-semibold">바로가기</h2>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/admin/students/${record.examNumber}`}
                className="inline-flex items-center justify-center rounded-full border border-ink/10 px-4 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 상세 페이지
              </Link>
              <Link
                href={`/admin/counseling/${record.id}`}
                className="inline-flex items-center justify-center rounded-full border border-ink/10 px-4 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                면담 기록 수정
              </Link>
              <Link
                href={`/admin/consultations?examNumber=${record.examNumber}`}
                className="inline-flex items-center justify-center rounded-full border border-ink/10 px-4 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                이 학생 상담 전체
              </Link>
            </div>
          </div>

          {/* Record meta */}
          <div className="rounded-[28px] border border-ink/10 bg-mist p-6">
            <h2 className="text-base font-semibold">기록 정보</h2>
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-xs font-medium text-slate">기록 ID</dt>
                <dd className="mt-0.5 text-sm text-ink">#{record.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate">최초 등록</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {record.createdAt.toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate">마지막 수정</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {record.updatedAt.toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              {record.nextSchedule && (
                <div>
                  <dt className="text-xs font-medium text-slate">
                    다음 상담 예정일
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ember">
                    {record.nextSchedule.toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
