import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getActiveAcademySettings } from "@/lib/academy-settings";
import { ApprovalRulesForm } from "./approval-rules-form";

export const dynamic = "force-dynamic";

export type ApprovalRulesSettings = {
  refundApprovalThreshold: number;
  discountApprovalThreshold: number;
  cashApprovalThreshold: number;
};

const DEFAULTS: ApprovalRulesSettings = {
  refundApprovalThreshold: 200000,
  discountApprovalThreshold: 50000,
  cashApprovalThreshold: 100000,
};

// 역할 등급 (낮은 순)
const ROLES: { role: AdminRole; label: string; level: number }[] = [
  { role: AdminRole.VIEWER, label: "열람자", level: 0 },
  { role: AdminRole.TEACHER, label: "강사", level: 1 },
  { role: AdminRole.COUNSELOR, label: "상담원", level: 2 },
  { role: AdminRole.ACADEMIC_ADMIN, label: "교무", level: 3 },
  { role: AdminRole.MANAGER, label: "실장", level: 4 },
  { role: AdminRole.DEPUTY_DIRECTOR, label: "부원장", level: 5 },
  { role: AdminRole.DIRECTOR, label: "원장", level: 6 },
  { role: AdminRole.SUPER_ADMIN, label: "최고관리자", level: 7 },
];

// 권한 매트릭스 정의: 각 기능에 필요한 최소 역할 레벨
const PERMISSION_MATRIX: {
  category: string;
  items: { label: string; minLevel: number; note?: string }[];
}[] = [
  {
    category: "수강 관리",
    items: [
      { label: "수강생 조회", minLevel: 0 },
      { label: "수강 신규 등록", minLevel: 2 },
      { label: "수강 상태 변경 (휴원·복교)", minLevel: 3 },
      { label: "수강 강제 취소", minLevel: 4 },
    ],
  },
  {
    category: "수납 관리",
    items: [
      { label: "수납 내역 조회", minLevel: 2 },
      { label: "수납 등록 (현금·이체)", minLevel: 2 },
      { label: "수납 등록 (온라인 링크 생성)", minLevel: 3 },
      {
        label: "할인 적용 (기준 금액 이하)",
        minLevel: 3,
        note: "discountApprovalThreshold 이하",
      },
      {
        label: "할인 적용 (기준 금액 초과)",
        minLevel: 3,
        note: "discountApprovalThreshold 초과 → 교무↑ 승인",
      },
    ],
  },
  {
    category: "환불 처리",
    items: [
      { label: "환불 신청 접수", minLevel: 2 },
      { label: "환불 처리 (기준 금액 미만)", minLevel: 3 },
      {
        label: "환불 처리 (기준 금액 이상)",
        minLevel: 6,
        note: "refundApprovalThreshold 이상 → 원장↑ 승인",
      },
    ],
  },
  {
    category: "결석 · 상담",
    items: [
      { label: "결석 사유서 조회", minLevel: 1 },
      { label: "결석 사유서 승인·반려", minLevel: 3 },
      { label: "상담 기록 등록", minLevel: 2 },
      { label: "상담 기록 조회", minLevel: 2 },
    ],
  },
  {
    category: "성적 · 출결",
    items: [
      { label: "성적 조회", minLevel: 1 },
      { label: "성적 입력·수정", minLevel: 1 },
      { label: "출결 조회", minLevel: 1 },
      { label: "출결 수동 수정", minLevel: 3 },
    ],
  },
  {
    category: "시설 관리",
    items: [
      { label: "사물함 현황 조회", minLevel: 2 },
      { label: "사물함 배정·반납", minLevel: 2 },
      { label: "스터디룸 배정", minLevel: 2 },
      { label: "사물함 초기 설정", minLevel: 4 },
    ],
  },
  {
    category: "시스템 설정",
    items: [
      { label: "강좌·기수 관리", minLevel: 4 },
      { label: "직원 계정 관리", minLevel: 4 },
      { label: "승인 라인 설정", minLevel: 6 },
      { label: "시스템 전체 설정", minLevel: 7 },
    ],
  },
];

function CheckIcon({ allowed }: { allowed: boolean }) {
  if (allowed) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-forest/10 text-forest">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6l3 3 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/5 text-ink/20">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M2.5 7.5l5-5M7.5 7.5l-5-5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export default async function ApprovalRulesPage() {
  const context = await requireAdminContext(AdminRole.DIRECTOR);

  if (context.activeAcademyId === null) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          지점 선택 필요
        </div>
        <h1 className="mt-5 text-3xl font-semibold">결재 기준은 지점을 선택한 뒤 수정할 수 있습니다.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          전체 지점 보기 모드에서는 지점별 결재 기준을 저장할 수 없습니다. 상단 지점 전환에서 대상 지점을 먼저 선택해 주세요.
        </p>
      </div>
    );
  }

  const settings = await getActiveAcademySettings();

  const current: ApprovalRulesSettings = {
    refundApprovalThreshold:
      settings?.refundApprovalThreshold ?? DEFAULTS.refundApprovalThreshold,
    discountApprovalThreshold:
      settings?.discountApprovalThreshold ?? DEFAULTS.discountApprovalThreshold,
    cashApprovalThreshold: settings?.cashApprovalThreshold ?? DEFAULTS.cashApprovalThreshold,
  };

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">승인 라인 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        환불·할인·현금 지급 처리 시 상위 결재가 필요한 금액 기준을 설정하고, 역할별 권한
        매트릭스를 확인합니다.
      </p>

      {/* 섹션 1: 금액 기준 설정 폼 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">금액 기준 설정</h2>
        <p className="mt-1 text-sm text-slate">
          이 금액 이상의 환불·할인·현금 지급 처리 시 상위 승인이 필요합니다.
        </p>
        <div className="mt-5 max-w-2xl">
          <ApprovalRulesForm initialSettings={current} />
        </div>
      </div>

      {/* 섹션 2: 역할 권한 매트릭스 */}
      <div className="mt-14">
        <h2 className="text-xl font-semibold text-ink">역할별 권한 매트릭스</h2>
        <p className="mt-1 text-sm text-slate">
          각 역할이 수행할 수 있는 기능을 카테고리별로 표시합니다. 높은 역할은 낮은 역할의 권한을
          모두 포함합니다.
        </p>

        {/* 역할 레전드 */}
        <div className="mt-5 flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <span
              key={r.role}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-ink"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-forest/10 text-[10px] font-bold text-forest">
                {r.level}
              </span>
              {r.label}
            </span>
          ))}
        </div>

        {/* 매트릭스 테이블 */}
        <div className="mt-5 overflow-x-auto rounded-[28px] border border-ink/10 shadow-panel">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist/80">
                <th className="min-w-[220px] px-5 py-3.5 text-left text-xs font-semibold text-slate">
                  기능
                </th>
                {ROLES.map((r) => (
                  <th
                    key={r.role}
                    className="min-w-[68px] px-2 py-3.5 text-center text-xs font-semibold text-slate"
                  >
                    <span className="block">{r.label}</span>
                    <span className="mt-0.5 block text-[10px] text-slate/50">Lv.{r.level}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5 bg-white">
              {PERMISSION_MATRIX.map((section) => (
                <>
                  {/* 카테고리 헤더 행 */}
                  <tr
                    key={`cat-${section.category}`}
                    className="border-t border-ink/10 bg-mist/40"
                  >
                    <td
                      colSpan={ROLES.length + 1}
                      className="px-5 py-2 text-xs font-bold uppercase tracking-widest text-forest"
                    >
                      {section.category}
                    </td>
                  </tr>
                  {/* 기능 행 */}
                  {section.items.map((item) => (
                    <tr
                      key={`${section.category}-${item.label}`}
                      className="transition hover:bg-mist/20"
                    >
                      <td className="px-5 py-3">
                        <span className="text-sm text-ink">{item.label}</span>
                        {item.note && (
                          <span className="ml-2 text-xs text-slate/60">({item.note})</span>
                        )}
                      </td>
                      {ROLES.map((r) => (
                        <td
                          key={r.role}
                          className="px-2 py-3 text-center"
                          title={
                            r.level >= item.minLevel
                              ? `${r.label} 가능`
                              : `${r.label} 불가 (최소 Lv.${item.minLevel} 필요)`
                          }
                        >
                          <div className="flex justify-center">
                            <CheckIcon allowed={r.level >= item.minLevel} />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* 안내 */}
        <div className="mt-4 rounded-[20px] border border-ink/5 bg-mist/60 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">안내</p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>높은 역할(Lv.)은 낮은 역할의 모든 권한을 포함합니다.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                환불·할인 승인 기준 금액은 위의 <strong className="text-ink">금액 기준 설정</strong>
                에서 변경 가능합니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                역할 권한 범위 변경이 필요한 경우 개발팀에 문의하세요. (코드 레벨 설정)
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
