import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EnrollmentImportForm } from "./enrollment-import-form";

export const dynamic = "force-dynamic";

const TEMPLATE_HEADERS = "학번,강좌유형,강좌명,시작일,종료일,수강료,할인금액,담당자학번";
const TEMPLATE_SAMPLE = [
  TEMPLATE_HEADERS,
  "2025001,종합,2026 공채 종합반 1기,2026-01-01,2026-03-31,900000,0,",
  "2025002,특강,형사법 특강,2026-02-01,2026-02-28,120000,30000,",
  "2025003,단과,경찰학 단과,2026-01-15,,150000,0,",
].join("\n");

export default async function EnrollmentImportPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const enrollmentCount = await getPrisma().courseEnrollment.count();

  return (
    <div className="p-8 sm:p-10">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin" className="transition hover:text-ink">
          관리자
        </Link>
        <span>/</span>
        <Link href="/admin/import-hub" className="transition hover:text-ink">
          데이터 가져오기
        </Link>
        <span>/</span>
        <span className="text-ink">수강 일괄 등록</span>
      </nav>

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수강 일괄 등록
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">수강 CSV 가져오기</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            CSV 파일로 수강 이력을 한 번에 등록합니다. 현재 <strong>{enrollmentCount.toLocaleString()}건</strong>의 수강 내역이 등록되어 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_SAMPLE)}`}
            download="enrollment_import_template.csv"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
          >
            템플릿 다운로드
          </a>
          <Link
            href="/admin/import-hub"
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            가져오기 허브
          </Link>
        </div>
      </div>

      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">CSV 형식 안내</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate">필수 컬럼</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate">
              <li><strong className="text-ink">학번</strong>: 등록된 학생의 학번</li>
              <li><strong className="text-ink">시작일</strong>: YYYY-MM-DD 형식</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate">선택 컬럼</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate">
              <li><strong className="text-ink">강좌유형</strong>: 종합, 단과, 특강</li>
              <li><strong className="text-ink">강좌명</strong>: 기수·상품명과 유사할수록 자동 연결 정확도가 높습니다.</li>
              <li><strong className="text-ink">종료일</strong>: 비워 두면 진행 중 수강으로 처리됩니다.</li>
              <li><strong className="text-ink">할인금액</strong>: 없으면 0원으로 처리됩니다.</li>
            </ul>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-mist px-4 py-3">
          <p className="text-xs font-medium text-slate">예시 CSV 내용</p>
          <code className="mt-1 block whitespace-pre text-xs text-ink">{TEMPLATE_SAMPLE}</code>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700">주의사항</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
            <li>학번은 반드시 이미 등록된 학생이어야 합니다.</li>
            <li>강좌명은 기수 또는 상품명과 비슷할수록 자동 연결이 잘 됩니다.</li>
            <li>같은 학생·같은 강좌의 중복 등록은 자동으로 건너뜁니다.</li>
          </ul>
        </div>
      </section>

      <div className="mt-6">
        <EnrollmentImportForm />
      </div>
    </div>
  );
}