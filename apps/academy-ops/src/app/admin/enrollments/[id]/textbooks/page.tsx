import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const SUBJECT_LABEL: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "누적",
};

export default async function EnrollmentTextbooksPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const enrollmentId = params.id;

  const enrollment = await getPrisma().courseEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: { select: { name: true, examNumber: true } },
      cohort: { select: { name: true, examCategory: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
  });

  if (!enrollment) notFound();

  const courseName =
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    "수강 정보";

  const rawTextbooks = await getPrisma().textbook.findMany({
    where: { isActive: true },
    orderBy: [{ title: "asc" }],
  });

  const textbooks = rawTextbooks.map((t) => ({ ...t, id: String(t.id) }));

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>

      <h1 className="mt-5 text-3xl font-semibold">교재 추천</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강 등록 완료 후 교재를 판매 처리합니다. 교재를 선택하면 해당 학생의 교재 판매 수납 페이지로 이동합니다.
      </p>

      {/* Success confirmation banner */}
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4">
        <svg
          className="h-5 w-5 flex-shrink-0 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-green-800">수강 등록이 완료되었습니다.</p>
          <p className="mt-0.5 text-xs text-green-700">
            교재를 추가로 판매하거나 &apos;교재 없이 계속&apos;을 눌러 수강 상세 페이지로 이동하세요.
          </p>
        </div>
      </div>

      {/* Enrollment summary */}
      <div className="mt-6 rounded-2xl border border-ink/10 bg-white px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate">학생명</dt>
            <dd className="mt-0.5 font-semibold text-ink">
              <Link
                href={`/admin/students/${enrollment.student.examNumber}`}
                className="hover:text-forest underline underline-offset-2"
              >
                {enrollment.student.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-slate">학번</dt>
            <dd className="mt-0.5 font-medium text-ink tabular-nums">
              {enrollment.student.examNumber}
            </dd>
          </div>
          <div>
            <dt className="text-slate">수강 과정</dt>
            <dd className="mt-0.5 font-medium text-ink">{courseName}</dd>
          </div>
          <div>
            <dt className="text-slate">등록 ID</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate">{enrollmentId}</dd>
          </div>
        </dl>
      </div>

      {/* Textbook grid */}
      <div className="mt-8">
        {textbooks.length === 0 ? (
          <div className="rounded-2xl border border-ink/10 bg-white px-6 py-12 text-center">
            <p className="text-sm text-slate">등록된 교재가 없습니다.</p>
            <p className="mt-1 text-xs text-slate/70">
              교재를 등록하려면{" "}
              <Link href="/admin/settings/textbooks" className="text-forest underline">
                교재 관리
              </Link>
              로 이동하세요.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {textbooks.map((textbook) => {
              const paymentUrl = `/admin/payments/new?studentExamNumber=${encodeURIComponent(
                enrollment.student.examNumber,
              )}&textbookId=${encodeURIComponent(textbook.id)}`;

              return (
                <div
                  key={textbook.id}
                  className="flex flex-col rounded-[20px] border border-ink/10 bg-white p-5 transition hover:border-ember/30 hover:shadow-sm"
                >
                  {/* Subject badge */}
                  {textbook.subject ? (
                    <span className="mb-3 inline-flex w-fit rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                      {SUBJECT_LABEL[textbook.subject] ?? textbook.subject}
                    </span>
                  ) : (
                    <span className="mb-3 inline-flex w-fit rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-medium text-slate">
                      일반
                    </span>
                  )}

                  {/* Title */}
                  <h3 className="flex-1 text-sm font-semibold leading-snug text-ink">
                    {textbook.title}
                  </h3>

                  {/* Author / Publisher */}
                  {(textbook.author ?? textbook.publisher) && (
                    <p className="mt-1.5 text-xs text-slate">
                      {[textbook.author, textbook.publisher].filter(Boolean).join(" · ")}
                    </p>
                  )}

                  {/* Price */}
                  <p className="mt-3 text-lg font-bold tabular-nums text-ember">
                    {textbook.price.toLocaleString()}원
                  </p>

                  {/* Stock */}
                  <p className="mt-0.5 text-xs text-slate">
                    재고:{" "}
                    <span className={textbook.stock <= 0 ? "text-red-500 font-medium" : "text-ink"}>
                      {textbook.stock}권
                    </span>
                  </p>

                  {/* Action button */}
                  <Link
                    href={paymentUrl}
                    className="mt-4 block rounded-full bg-ember px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-ember/90"
                  >
                    교재 판매 처리
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={`/admin/enrollments/${enrollmentId}`}
          className="inline-flex items-center justify-center rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90"
        >
          교재 없이 계속 →
        </Link>
        <Link
          href="/admin/enrollments"
          className="inline-flex items-center justify-center rounded-full border border-ink/10 px-6 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          수강 목록으로
        </Link>
      </div>
    </div>
  );
}
