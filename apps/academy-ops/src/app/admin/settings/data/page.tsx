import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

type DataHubCard = {
  href: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
};

const IMPORT_CARDS: DataHubCard[] = [
  {
    href: "/admin/students/import",
    title: "학생 명단 가져오기",
    description: "Excel(XLSX) 또는 CSV 파일을 업로드해 학생 명단을 한꺼번에 등록하거나 업데이트합니다. 열 매핑 직접 지정 지원.",
    badge: "Excel / CSV",
    badgeColor: "border-forest/20 bg-forest/10 text-forest",
  },
  {
    href: "/admin/students/paste-import",
    title: "붙여넣기 학생 등록",
    description: "엑셀·메모장에서 복사한 학생 데이터를 붙여넣기로 빠르게 등록합니다. 소규모 추가 등록에 적합합니다.",
    badge: "붙여넣기",
    badgeColor: "border-forest/20 bg-forest/10 text-forest",
  },
  {
    href: "/admin/scores/bulk-import",
    title: "성적 일괄 가져오기",
    description: "기간·회차별 성적 파일을 업로드해 전체 수강생 성적을 한꺼번에 입력합니다. 오프라인·온라인 양식 모두 지원.",
    badge: "성적 / 점수",
    badgeColor: "border-ember/20 bg-ember/10 text-ember",
  },
];

const EXPORT_CARDS: DataHubCard[] = [
  {
    href: "/admin/export",
    title: "전체 데이터 내보내기",
    description: "수강생 명단과 성적 원본 데이터를 CSV 또는 xlsx로 다운로드합니다. UTF-8 BOM 인코딩으로 Excel 호환.",
    badge: "CSV / Excel",
    badgeColor: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    href: "/admin/enrollments",
    title: "수강 내역 엑셀",
    description: "수강 관리 페이지에서 기수·기간별 수강생 명단을 엑셀로 내보낼 수 있습니다. 수강대장 출력도 지원합니다.",
    badge: "수강 관리",
    badgeColor: "border-sky-200 bg-sky-50 text-sky-700",
  },
];

const MIGRATION_CARDS: DataHubCard[] = [
  {
    href: "/admin/migration",
    title: "기존 데이터 이전",
    description: "에듀그램 등 기존 운영 시스템에서 학생 명단과 성적 데이터를 현재 시스템으로 이전합니다. 미리보기 및 롤백 지원.",
    badge: "레거시 이관",
    badgeColor: "border-amber-200 bg-amber-50 text-amber-700",
  },
];

function HubCard({ card }: { card: DataHubCard }) {
  return (
    <Link
      href={card.href}
      prefetch={false}
      className="group flex flex-col gap-3 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-ember/30 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${card.badgeColor}`}
        >
          {card.badge}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="mt-0.5 shrink-0 text-slate transition group-hover:text-ember"
        >
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>
        <h3 className="font-semibold text-ink transition group-hover:text-ember">
          {card.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate">
          {card.description}
        </p>
      </div>
    </Link>
  );
}

export default async function DataManagementPage() {
  await requireAdminContext(AdminRole.MANAGER);

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">데이터 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생 데이터 가져오기·내보내기, 시스템 백업을 관리합니다.
      </p>

      {/* 가져오기 섹션 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">가져오기</h2>
        <p className="mt-1 text-sm text-slate">
          외부 파일 또는 붙여넣기로 학생·성적 데이터를 시스템에 등록합니다.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {IMPORT_CARDS.map((card) => (
            <HubCard key={card.href} card={card} />
          ))}
        </div>
      </div>

      {/* 내보내기 섹션 */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold text-ink">내보내기</h2>
        <p className="mt-1 text-sm text-slate">
          수강생 명단, 성적, 수납 내역을 CSV·Excel 파일로 다운로드합니다.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORT_CARDS.map((card) => (
            <HubCard key={card.href} card={card} />
          ))}
        </div>
      </div>

      {/* 마이그레이션 섹션 */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold text-ink">마이그레이션</h2>
        <p className="mt-1 text-sm text-slate">
          기존 운영 시스템의 데이터를 현재 시스템으로 이전합니다.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MIGRATION_CARDS.map((card) => (
            <HubCard key={card.href} card={card} />
          ))}
        </div>
      </div>

      {/* 주의사항 */}
      <div className="mt-12 rounded-[20px] border border-amber-200 bg-amber-50 px-6 py-5">
        <div className="flex items-start gap-3">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            className="mt-0.5 shrink-0 text-amber-600"
          >
            <path
              d="M9 1.5L1.5 15h15L9 1.5ZM9 7v4M9 12.5h.01"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">데이터 가져오기 전 주의사항</p>
            <ul className="mt-2 space-y-1.5 text-sm text-amber-700">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">·</span>
                <span>데이터 가져오기 전 반드시 백업을 수행하세요.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">·</span>
                <span>잘못된 데이터 가져오기는 되돌리기 어렵습니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">·</span>
                <span>마이그레이션 기능은 미리보기를 통해 반영 전 결과를 확인할 수 있습니다.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
