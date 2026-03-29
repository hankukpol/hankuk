import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext, roleAtLeast } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STUDENT_TEMPLATE_HEADERS = [
  "이름",
  "전화번호",
  "생년월일(YYMMDD)",
  "직렬(공채/경채)",
  "학번(선택)",
].join(",");

const ENROLLMENT_TEMPLATE_HEADERS = [
  "학번",
  "강좌유형(종합/단과/특강)",
  "강좌명",
  "시작일(YYYY-MM-DD)",
  "종료일(YYYY-MM-DD)",
  "수강료",
  "할인금액",
  "담당자학번",
].join(",");

const PAYMENT_TEMPLATE_HEADERS = [
  "학번",
  "결제일(YYYY-MM-DD)",
  "결제방법(CASH/CARD/TRANSFER)",
  "수납금액(원)",
  "분류(TUITION/TEXTBOOK/FACILITY/ETC)",
  "비고",
].join(",");

type ImportCard = {
  key: string;
  title: string;
  description: string;
  icon: string;
  dbCount: number;
  dbLabel: string;
  templateHeaders: string;
  templateFilename: string;
  href?: string;
  buttonLabel: string;
  helperText: string;
  accent: string;
  accentButton: string;
  disabled?: boolean;
};

export default async function ImportHubPage() {
  const context = await requireAdminContext(AdminRole.MANAGER);
  const prisma = getPrisma();
  const canImportPayments = roleAtLeast(context.adminUser.role, AdminRole.DIRECTOR);

  const [studentCount, enrollmentCount, paymentCount] = await Promise.all([
    prisma.student.count(),
    prisma.courseEnrollment.count(),
    prisma.payment.count(),
  ]);

  const importCards: ImportCard[] = [
    {
      key: "students",
      title: "학생 일괄 등록",
      description:
        "CSV 파일로 학생 명단을 한 번에 등록합니다. 같은 학번이 있으면 기존 학생 정보를 최신 값으로 갱신합니다.",
      icon: "01",
      dbCount: studentCount,
      dbLabel: "등록된 학생",
      templateHeaders: STUDENT_TEMPLATE_HEADERS,
      templateFilename: "student_import_template.csv",
      href: "/admin/import-hub/students",
      buttonLabel: "학생 가져오기",
      helperText: "학생 기본 정보와 학번 체계를 먼저 정리할 때 사용합니다.",
      accent: "border-forest/20 bg-forest/5",
      accentButton: "bg-forest text-white hover:bg-forest/90",
    },
    {
      key: "enrollments",
      title: "수강 일괄 등록",
      description:
        "기존 프로그램의 수강 이력을 CSV로 옮겨 와 현재 학생 데이터와 연결합니다.",
      icon: "02",
      dbCount: enrollmentCount,
      dbLabel: "수강 등록 건수",
      templateHeaders: ENROLLMENT_TEMPLATE_HEADERS,
      templateFilename: "enrollment_import_template.csv",
      href: "/admin/import-hub/enrollments",
      buttonLabel: "수강 가져오기",
      helperText: "학생 등록이 끝난 뒤, 학번 기준으로 수강 내역을 연결합니다.",
      accent: "border-amber-200 bg-amber-50",
      accentButton: "bg-amber-600 text-white hover:bg-amber-700",
    },
    {
      key: "payments",
      title: "수납 일괄 등록",
      description:
        "CSV로 정리한 수납 내역을 기존 학생과 수강 등록에 연결합니다. 현재 구현은 DIRECTOR 이상 권한에서만 실행됩니다.",
      icon: "03",
      dbCount: paymentCount,
      dbLabel: "수납 건수",
      templateHeaders: PAYMENT_TEMPLATE_HEADERS,
      templateFilename: "payment_import_template.csv",
      href: canImportPayments ? "/admin/import-hub/payments" : undefined,
      buttonLabel: canImportPayments ? "수납 가져오기" : "DIRECTOR 이상 필요",
      helperText: canImportPayments
        ? "결제 CSV 업로드 후 기존 ACTIVE 수강 등록과 자동 연결합니다."
        : "수납 이관은 DIRECTOR 이상 권한에서만 실행할 수 있습니다.",
      accent: "border-ember/20 bg-ember/5",
      accentButton: "bg-ember text-white hover:bg-ember/90",
      disabled: !canImportPayments,
    },
  ];

  return (
    <div className="p-8 sm:p-10">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin" className="transition hover:text-ink">
          관리자
        </Link>
        <span>/</span>
        <span className="text-ink">데이터 가져오기</span>
      </nav>

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        데이터 마이그레이션
      </div>
      <div className="mt-5">
        <h1 className="text-3xl font-semibold">일괄 데이터 가져오기</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
          학생, 수강, 수납 CSV를 현재 운영 시스템으로 옮깁니다. 최신 구현이 있는 경로만 연결하고,
          아직 별도 화면이 없는 기능은 기존 이관 API를 재사용해 허브에서 바로 실행할 수 있게 정리했습니다.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm font-semibold text-amber-800">가져오기 전 확인 사항</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-700">
          <li>업로드 전 원본 CSV를 별도 백업해 두세요.</li>
          <li>학생 등록이 먼저 끝나야 수강·수납 데이터가 학번 기준으로 안전하게 연결됩니다.</li>
          <li>수납 일괄 등록은 현재 DIRECTOR 이상 권한에서만 실행됩니다.</li>
          <li>성적 이관은 별도 성적 import 화면을 사용하고, 이 허브 대상에서는 제외합니다.</li>
        </ul>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {importCards.map((card) => (
          <section key={card.key} className={`rounded-[28px] border p-6 ${card.accent}`}>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/80 text-sm font-semibold text-ink">
              {card.icon}
            </div>
            <h2 className="mt-4 text-lg font-semibold text-ink">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate">{card.description}</p>

            <div className="mt-4 flex items-end gap-2">
              <span className="text-2xl font-semibold text-ink">{card.dbCount.toLocaleString()}</span>
              <span className="pb-1 text-xs text-slate">{card.dbLabel}</span>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate">{card.helperText}</p>

            <div className="mt-5 flex flex-col gap-2">
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(card.templateHeaders + "\n")}`}
                download={card.templateFilename}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest"
              >
                템플릿 다운로드 (CSV)
              </a>
              {card.href && !card.disabled ? (
                <Link
                  href={card.href}
                  className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${card.accentButton}`}
                >
                  {card.buttonLabel}
                </Link>
              ) : (
                <span className="inline-flex items-center justify-center rounded-full border border-ink/10 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate">
                  {card.buttonLabel}
                </span>
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">CSV 작성 가이드</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold text-forest">학생 등록</h3>
            <p className="mt-2 text-xs leading-5 text-slate">
              이름은 필수입니다. 전화번호는 <code className="rounded bg-mist px-1 py-0.5">010-0000-0000</code>
              형식을 권장하고, 생년월일은 <code className="rounded bg-mist px-1 py-0.5">YYMMDD</code> 6자리로 입력합니다.
            </p>
            <code className="mt-2 block rounded-xl bg-mist px-3 py-2 text-[11px] text-ink">
              {STUDENT_TEMPLATE_HEADERS}
            </code>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-700">수강 등록</h3>
            <p className="mt-2 text-xs leading-5 text-slate">
              학번과 시작일은 필수입니다. 강좌유형은 <code className="rounded bg-mist px-1 py-0.5">종합</code>,
              <code className="ml-1 rounded bg-mist px-1 py-0.5">단과</code>,
              <code className="ml-1 rounded bg-mist px-1 py-0.5">특강</code> 중 하나를 사용하세요.
            </p>
            <code className="mt-2 block rounded-xl bg-mist px-3 py-2 text-[11px] text-ink">
              {ENROLLMENT_TEMPLATE_HEADERS}
            </code>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ember">수납 등록</h3>
            <p className="mt-2 text-xs leading-5 text-slate">
              결제일, 결제방법, 수납금액은 필수입니다. 결제방법은
              <code className="ml-1 rounded bg-mist px-1 py-0.5">CASH</code>,
              <code className="ml-1 rounded bg-mist px-1 py-0.5">CARD</code>,
              <code className="ml-1 rounded bg-mist px-1 py-0.5">TRANSFER</code>를 사용하세요.
            </p>
            <code className="mt-2 block rounded-xl bg-mist px-3 py-2 text-[11px] text-ink">
              {PAYMENT_TEMPLATE_HEADERS}
            </code>
          </div>
        </div>
      </section>
    </div>
  );
}