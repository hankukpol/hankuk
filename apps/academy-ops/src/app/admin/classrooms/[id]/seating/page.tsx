import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintSeatingButton } from "./print-seating-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function SeatingPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = params;
  const prisma = getPrisma();

  const classroom = await prisma.classroom.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      generation: true,
      teacher: { select: { id: true, name: true } },
      students: {
        where: { leftAt: null },
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          joinedAt: true,
          student: {
            select: {
              examNumber: true,
              name: true,
              generation: true,
              phone: true,
              courseEnrollments: {
                where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  cohort: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!classroom) notFound();

  const students = classroom.students;
  const total = students.length;

  const issuedDate = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-8 sm:p-10">
      {/* 인쇄 스타일 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}</style>

      {/* 상단 네비 */}
      <div className="no-print flex items-center gap-2 mb-2">
        <Link
          href={`/admin/classrooms/${id}`}
          className="text-sm text-slate-500 hover:text-ink transition"
        >
          ← {classroom.name}
        </Link>
      </div>

      <div className="no-print">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          좌석 배정
        </div>
        <h1 className="mt-5 text-3xl font-semibold">
          {classroom.name} — 좌석 배정표
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          담임: {classroom.teacher.name}
          {classroom.generation ? ` · ${classroom.generation}기` : ""}
          {" · "}재적 {total}명
        </p>
        <p className="mt-1 text-xs text-slate-400">
          좌석 번호는 담임반 등록 순서로 자동 배정됩니다.
        </p>
      </div>

      {/* 통계 + 액션 */}
      <div className="no-print mt-6 flex flex-wrap items-center gap-4">
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 px-6 py-4 text-center min-w-[100px]">
          <p className="text-2xl font-bold text-forest">{total}</p>
          <p className="text-xs text-slate-500 mt-1">배정됨</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href={`/admin/classrooms/${id}/seating/heatmap`}
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
          >
            출석 현황
          </Link>
          <PrintSeatingButton />
        </div>
      </div>

      {/* 좌석 배정 테이블 */}
      <div className="mt-6 overflow-hidden rounded-[20px] border border-ink/10">
        <table className="w-full text-sm">
          <thead className="bg-mist border-b border-ink/10">
            <tr>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 w-16">
                좌석번호
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                학생명
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                학번
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                수강반
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 no-print">
                연락처
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {students.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  재적 학생이 없습니다.
                </td>
              </tr>
            ) : (
              students.map((cs, idx) => {
                const seatNum = idx + 1;
                const enrollment = cs.student.courseEnrollments[0];
                const cohortName = enrollment?.cohort?.name ?? "-";

                return (
                  <tr
                    key={cs.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-mist/40"}
                  >
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-forest/10 text-xs font-bold text-forest">
                        {seatNum}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/students/${cs.student.examNumber}`}
                        className="no-print hover:text-ember transition"
                      >
                        {cs.student.name}
                      </Link>
                      <span className="hidden print:inline">{cs.student.name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">
                      {cs.student.examNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {cohortName}
                    </td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums no-print">
                      {cs.student.phone ?? "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 인쇄용 하단 (화면에서는 숨김) */}
      <div
        className="mt-8 border-t border-ink/10 pt-5"
        style={{ display: "none" }}
        id="seating-print-footer"
      >
        <div className="flex items-end justify-between">
          <div className="text-xs text-slate-500">
            <p className="font-semibold text-sm text-ink">학원명 미설정</p>
            <p className="mt-0.5">학원 주소는 관리자 설정을 확인하세요</p>
            <p className="mt-0.5">대표전화: 연락처는 관리자 설정을 확인하세요</p>
          </div>
          <div className="text-xs text-slate-400">출력일: {issuedDate}</div>
        </div>
      </div>

      {/* 화면 전용 안내 */}
      <p className="no-print mt-4 text-xs text-slate-400 text-center">
        인쇄 시 A4 세로 방향을 권장합니다.
      </p>
    </div>
  );
}
