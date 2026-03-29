import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import {
  resolveScoreCorrectionTargets,
} from "@/lib/scores/correction-links";
import { resolveVisibleScoreSessionAcademyId } from "@/lib/scores/session-admin";

export const dynamic = "force-dynamic";

export default async function ScoreCorrectionsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const academyId = await resolveVisibleScoreSessionAcademyId();

  const corrections = await prisma.adminMemo.findMany({
    where: {
      content: { startsWith: "[성적 오류 신고]" },
    },
    include: {
      owner: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Fetch student names for related exam numbers
  const examNumbers = [
    ...new Set(corrections.map((c) => c.relatedStudentExamNumber).filter(Boolean) as string[]),
  ];

  const students =
    examNumbers.length > 0
      ? await prisma.student.findMany({
          where: { examNumber: { in: examNumbers } },
          select: { examNumber: true, name: true },
        })
      : [];

  const studentMap = new Map(students.map((s) => [s.examNumber, s.name]));
  const correctionTargets = await resolveScoreCorrectionTargets({
    memos: corrections,
    academyId,
  });

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "성적 관리", href: "/admin/scores/edit" },
          { label: "회차별 성적 오류 신고 목록" },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">회차별 성적 오류 신고 목록</h1>
          <p className="mt-2 text-sm text-slate">
            학생이 학생 포털에서 신고한 회차별 성적 오류 건입니다. 확인 후 해당 회차 성적 수정 화면에서 처리해 주세요.
          </p>
        </div>
        <Link
          href="/admin/scores/edit"
          className="inline-flex items-center rounded-full bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          성적 수정 화면 열기
        </Link>
      </div>

      {corrections.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
          아직 접수된 성적 오류 신고가 없습니다.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-5 py-4 font-semibold">신고일</th>
                <th className="px-5 py-4 font-semibold">학번</th>
                <th className="px-5 py-4 font-semibold">이름</th>
                <th className="px-5 py-4 font-semibold">내용 요약</th>
                <th className="px-5 py-4 font-semibold">처리 상태</th>
                <th className="px-5 py-4 font-semibold text-right">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {corrections.map((memo) => {
                const examNumber = memo.relatedStudentExamNumber;
                const studentName = examNumber ? (studentMap.get(examNumber) ?? "알 수 없음") : "-";
                const target = correctionTargets.get(memo.id);

                // Extract a short summary from the content
                const firstLine = memo.content?.split("\n")[0] ?? memo.title;
                const summary =
                  firstLine.length > 80 ? firstLine.slice(0, 80) + "…" : firstLine;
                const sessionLabel = target
                  ? [target.examDate, target.subjectLabel].filter(Boolean).join(" · ") || "회차 정보 없음"
                  : "회차 정보 없음";

                const statusLabel =
                  memo.status === "DONE"
                    ? "처리 완료"
                    : memo.status === "IN_PROGRESS"
                      ? "처리 중"
                      : "검토 중";
                const statusClass =
                  memo.status === "DONE"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : memo.status === "IN_PROGRESS"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-amber-200 bg-amber-50 text-amber-700";

                return (
                  <tr key={memo.id} className="hover:bg-mist/40">
                    <td className="px-5 py-4 text-slate">{formatDate(memo.createdAt)}</td>
                    <td className="px-5 py-4">
                      {examNumber ? (
                        <Link
                          href={`/admin/students/${examNumber}`}
                          className="font-semibold text-ember underline-offset-2 hover:underline"
                        >
                          {examNumber}
                        </Link>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-medium">{studentName}</td>
                    <td className="px-5 py-4 text-slate">
                      <Link
                        href={`/admin/score-corrections/${memo.id}`}
                        className="block hover:text-ink"
                      >
                        <span className="block font-medium text-ink">{sessionLabel}</span>
                        <span className="mt-1 block text-xs text-slate">{summary}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/score-corrections/${memo.id}`}
                          className="inline-flex items-center rounded-full border border-ink/20 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-mist"
                        >
                          상세
                        </Link>
                        {examNumber && (
                          <Link
                            href={target?.href ?? "/admin/scores/edit"}
                            className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-3 py-1.5 text-xs font-semibold text-forest transition hover:bg-forest/10"
                          >
                            회차 수정
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate">
        최근 50건 표시 · 처리 완료 후 해당 메모를 삭제하거나 상태를 변경해 주세요.
      </p>
    </div>
  );
}
