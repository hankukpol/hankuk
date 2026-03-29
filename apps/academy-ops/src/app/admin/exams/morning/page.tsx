import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { listPeriods } from "@/lib/periods/service";
import { MorningExamManager } from "./morning-exam-manager";

export const dynamic = "force-dynamic";

export default async function MorningExamPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const periods = await listPeriods();
  const periodOptions = periods.map((period) => ({
    id: period.id,
    name: period.name,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    isActive: period.isActive,
    isGongchaeEnabled: period.isGongchaeEnabled,
    isGyeongchaeEnabled: period.isGyeongchaeEnabled,
    enrollmentCount: period._count.enrollments,
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">아침 모의고사 수강 현황</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            현재 선택된 지점의 시험 기간별 수강생 현황을 조회합니다. 공채, 경채, 온라인 여부별 집계와 이름,
            학번 검색을 한 화면에서 처리할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/exams/morning/overview"
            className="inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/20"
          >
            성적 개요
          </Link>
          <Link
            href="/admin/exams/morning/scores"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            회차별 성적 관리
          </Link>
          <Link
            href="/admin/exams/morning/quick-entry"
            className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20"
          >
            빠른 입력
          </Link>
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center rounded-full border border-ember/30 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            성적 입력
          </Link>
          <Link
            href="/admin/periods"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            시험 기간 관리
          </Link>
        </div>
      </div>

      <div className="mt-8">
        {periodOptions.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-mist p-10 text-center">
            <p className="text-slate">등록된 시험 기간이 없습니다.</p>
            <Link
              href="/admin/periods"
              className="mt-4 inline-flex items-center rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
            >
              시험 기간 등록하기
            </Link>
          </div>
        ) : (
          <MorningExamManager periods={periodOptions} />
        )}
      </div>
    </div>
  );
}

