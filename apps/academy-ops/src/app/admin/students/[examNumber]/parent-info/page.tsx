import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ParentInfoForm } from "./parent-info-form";

export const dynamic = "force-dynamic";

export default async function StudentParentInfoPage({
  params,
}: {
  params: { examNumber: string };
}) {
  const { examNumber } = await Promise.resolve(params);
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      examType: true,
      parentName: true,
      parentRelation: true,
      parentMobile: true,
    },
  });

  if (!student) notFound();

  return (
    <div
      className="min-h-screen bg-[#F7F4EF]"
      style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
    >
      {/* 상단 네비게이션 */}
      <div className="border-b border-ink/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
          >
            ← {student.name}
          </Link>
          <span className="text-base font-semibold text-ink">보호자 정보</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        {/* 학생 헤더 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest/10 text-lg font-bold text-forest">
              {student.name.charAt(0)}
            </div>
            <div>
              <p className="text-xl font-semibold text-ink">{student.name}</p>
              <p className="text-sm text-slate">학번 {student.examNumber}</p>
            </div>
          </div>
        </div>

        {/* 현재 보호자 정보 요약 (읽기 전용) */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">현재 등록된 보호자 정보</h2>
          {student.parentName || student.parentRelation || student.parentMobile ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate">보호자 이름</dt>
                <dd className="mt-1 text-ink">{student.parentName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate">관계</dt>
                <dd className="mt-1 text-ink">{student.parentRelation ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate">연락처</dt>
                <dd className="mt-1 text-ink">
                  {student.parentMobile ? (
                    <a
                      href={`tel:${student.parentMobile}`}
                      className="text-forest transition hover:underline"
                    >
                      {student.parentMobile}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate">등록된 보호자 정보가 없습니다.</p>
          )}
        </div>

        {/* 보호자 정보 편집 폼 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-1 text-base font-semibold text-ink">보호자 정보 수정</h2>
          <p className="mb-5 text-sm text-slate">
            이름, 관계, 연락처를 입력하세요. 비워두면 해당 항목이 삭제됩니다.
          </p>
          <ParentInfoForm
            examNumber={student.examNumber}
            initialParentName={student.parentName}
            initialParentRelation={student.parentRelation}
            initialParentMobile={student.parentMobile}
          />
        </div>

        {/* 학생 연락처 확인 */}
        <div className="rounded-[28px] border border-ink/10 bg-mist/40 p-6">
          <h2 className="mb-2 text-sm font-semibold text-slate">학생 본인 연락처</h2>
          <p className="text-sm text-ink">
            {student.phone ? (
              <a
                href={`tel:${student.phone}`}
                className="text-forest transition hover:underline"
              >
                {student.phone}
              </a>
            ) : (
              <span className="text-slate">미등록</span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate">
            학생 연락처 수정은{" "}
            <Link
              href={`/admin/students/${examNumber}/contact-info`}
              className="text-forest underline"
            >
              연락처 정보
            </Link>{" "}
            페이지에서 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
