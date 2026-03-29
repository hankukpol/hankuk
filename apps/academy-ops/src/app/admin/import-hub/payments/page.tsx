import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentImportForm } from "./payment-import-form";

export const dynamic = "force-dynamic";

const TEMPLATE_HEADERS = "학번,결제일(YYYY-MM-DD),결제방법(CASH/CARD/TRANSFER),수납금액(원),분류(TUITION/TEXTBOOK/FACILITY/ETC),비고";
const TEMPLATE_SAMPLE = [
  TEMPLATE_HEADERS,
  "2025001,2026-03-04,CASH,800000,TUITION,초기 이관",
  "2025001,2026-03-04,CARD,45000,TEXTBOOK,형사법 교재",
].join("\n");

export default async function PaymentImportPage() {
  await requireAdminContext(AdminRole.DIRECTOR);

  const paymentCount = await getPrisma().payment.count();

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
        <span className="text-ink">수납 일괄 등록</span>
      </nav>

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 일괄 등록
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">수납 CSV 가져오기</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            CSV 파일로 수납 내역을 한 번에 이관합니다. 현재 <strong>{paymentCount.toLocaleString()}건</strong>의 수납 내역이 등록되어 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_SAMPLE)}`}
            download="payment_import_template.csv"
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
              <li><strong className="text-ink">결제일</strong>: YYYY-MM-DD 형식</li>
              <li><strong className="text-ink">결제방법</strong>: CASH, CARD, TRANSFER</li>
              <li><strong className="text-ink">수납금액</strong>: 0보다 큰 금액</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate">자동 연결 규칙</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate">
              <li>학생 학번을 기준으로 수납 대상을 찾습니다.</li>
              <li>현재 가장 최근 ACTIVE 수강 등록에 자동으로 연결합니다.</li>
              <li>분류 값이 없으면 기본적으로 수강료(TUITION)로 처리합니다.</li>
            </ul>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-mist px-4 py-3">
          <p className="text-xs font-medium text-slate">예시 CSV 내용</p>
          <code className="mt-1 block whitespace-pre text-xs text-ink">{TEMPLATE_SAMPLE}</code>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          이 화면은 기존 <code className="rounded bg-white/70 px-1 py-0.5">/api/migration/payments</code> 로직을 그대로 재사용합니다.
          새 결제 시스템을 추가로 만들지 않고 import 허브에 운영 진입점만 맞췄습니다.
        </div>
      </section>

      <div className="mt-6">
        <PaymentImportForm />
      </div>
    </div>
  );
}