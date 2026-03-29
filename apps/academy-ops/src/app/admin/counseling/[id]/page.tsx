import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { CounselingActions } from "./counseling-actions";
import { ConvertToEnrollmentButton } from "./convert-button";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CounselingRecordDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const recordId = Number(id);

  if (!Number.isInteger(recordId) || recordId <= 0) {
    notFound();
  }

  const prisma = getPrisma();

  const [record, cohorts, products, specialLectures] = await Promise.all([
    prisma.counselingRecord.findUnique({
      where: { id: recordId },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            examType: true,
            currentStatus: true,
          },
        },
      },
    }),
    prisma.cohort.findMany({
      where: { isActive: true },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true },
    }),
    prisma.comprehensiveCourseProduct.findMany({
      where: { isActive: true },
      orderBy: [{ examCategory: "asc" }, { durationMonths: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.specialLecture.findMany({
      where: { isActive: true },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!record) {
    notFound();
  }

  // Fetch other counseling records for this student (max 5, excluding current)
  const otherRecords = await prisma.counselingRecord.findMany({
    where: {
      examNumber: record.examNumber,
      id: { not: record.id },
    },
    orderBy: { counseledAt: "desc" },
    take: 5,
    select: {
      id: true,
      counseledAt: true,
      counselorName: true,
      content: true,
    },
  });

  const otherRecordsTotal = await prisma.counselingRecord.count({
    where: {
      examNumber: record.examNumber,
      id: { not: record.id },
    },
  });

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "학사 관리", href: "/admin/counseling" },
          { label: "학생 면담", href: "/admin/counseling" },
          { label: `${record.student.name} 면담` },
        ]}
      />

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
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
              면담
            </span>
          </h1>
          <p className="mt-2 text-sm text-slate">
            학번 {record.examNumber} · 담당 {record.counselorName}
          </p>
        </div>
        <Link
          href="/admin/counseling"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 목록으로
        </Link>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_320px]">
        {/* Main section */}
        <div className="space-y-6">
          {/* Student info card */}
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="border-b border-ink/10 px-6 py-4">
              <h2 className="text-base font-semibold">학생 정보</h2>
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
            </dl>
          </div>

          {/* Counseling detail card header */}
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">면담 기록</h2>
              <p className="mt-1 text-sm text-slate">
                수정 버튼을 눌러 내용을 인라인으로 편집할 수 있습니다.
              </p>
            </div>
            <CounselingActions
              record={{
                id: record.id,
                examNumber: record.examNumber,
                counselorName: record.counselorName,
                content: record.content,
                recommendation: record.recommendation,
                counseledAt: record.counseledAt.toISOString(),
                nextSchedule: record.nextSchedule
                  ? record.nextSchedule.toISOString()
                  : null,
              }}
            />
          </div>

          {/* Other counseling records for this student */}
          <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">
                이 학생의 다른 상담 기록
              </h2>
              {otherRecordsTotal > 0 ? (
                <Link
                  href={`/admin/counseling?examNumber=${record.examNumber}&search=${record.examNumber}`}
                  className="text-xs font-semibold text-ember hover:underline"
                >
                  전체 {otherRecordsTotal}건 보기 →
                </Link>
              ) : null}
            </div>

            {otherRecords.length === 0 ? (
              <p className="mt-4 text-sm text-slate">
                다른 면담 기록이 없습니다.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-ink/10">
                {otherRecords.map((r) => (
                  <Link
                    key={r.id}
                    href={`/admin/counseling/${r.id}`}
                    className="flex items-start gap-4 py-3 text-sm transition first:pt-0 last:pb-0 hover:text-ember"
                  >
                    <span className="w-28 shrink-0 text-xs text-slate">
                      {new Date(r.counseledAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {r.content.slice(0, 60)}
                      {r.content.length > 60 ? "..." : ""}
                    </span>
                    <span className="shrink-0 text-xs text-slate">
                      {r.counselorName}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {otherRecordsTotal > 5 ? (
              <p className="mt-4 text-xs text-slate">
                최근 5건만 표시 · 전체{" "}
                <Link
                  href={`/admin/counseling?examNumber=${record.examNumber}&search=${record.examNumber}`}
                  className="font-semibold text-ember hover:underline"
                >
                  {otherRecordsTotal}건
                </Link>
              </p>
            ) : null}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="self-start space-y-4 xl:sticky xl:top-6">
          {/* Convert to enrollment */}
          <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6">
            <h2 className="text-base font-semibold">수강 등록 전환</h2>
            <p className="mt-2 text-sm text-slate">
              이 면담 기록을 바탕으로 학생의 수강 등록을 생성합니다.
            </p>
            <div className="mt-4">
              <ConvertToEnrollmentButton
                recordId={record.id}
                studentName={record.student.name}
                examNumber={record.examNumber}
                cohorts={cohorts}
                products={products}
                specialLectures={specialLectures}
              />
            </div>
          </div>

          {/* Quick links */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-base font-semibold">학생 바로가기</h2>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/admin/students/${record.examNumber}`}
                className="inline-flex items-center justify-center rounded-full border border-ink/10 px-4 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 상세 페이지
              </Link>
              <Link
                href={`/admin/counseling?examNumber=${record.examNumber}&search=${record.examNumber}`}
                className="inline-flex items-center justify-center rounded-full border border-ink/10 px-4 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                이 학생 면담 관리
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
              <div>
                <dt className="text-xs font-medium text-slate">담당 강사</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {record.counselorName}
                </dd>
              </div>
              {record.nextSchedule ? (
                <div>
                  <dt className="text-xs font-medium text-slate">
                    다음 면담 예정일
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ember">
                    {record.nextSchedule.toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
