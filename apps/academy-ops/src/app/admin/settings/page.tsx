import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext, roleAtLeast } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SettingsCard = {
  href: string;
  label: string;
  description: string;
  group: string;
  minRole: AdminRole;
  badgeColor: string;
};

const SETTINGS_CARDS: SettingsCard[] = [
  // 학원 기본
  {
    href: "/admin/settings/academy",
    label: "학원 기본정보",
    description: "학원명, 원장, 사업자번호 등 기본 정보 설정",
    group: "학원",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-forest/20 bg-forest/10 text-forest",
  },
  {
    href: "/admin/settings/system",
    label: "시스템 설정",
    description: "운영 시간, 알림 채널, 수납 환불 정책 통합 관리",
    group: "학원",
    minRole: AdminRole.SUPER_ADMIN,
    badgeColor: "border-forest/20 bg-forest/10 text-forest",
  },
  // 수강·강좌
  {
    href: "/admin/settings/courses",
    label: "강좌 마스터",
    description: "종합반·단과·특강 강좌 등록 및 수강료 관리",
    group: "수강·강좌",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-ember/20 bg-ember/10 text-ember",
  },
  {
    href: "/admin/settings/comprehensive-products",
    label: "종합반 상품",
    description: "수험 유형별 수강 기간·수강료 상품 관리",
    group: "수강·강좌",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-ember/20 bg-ember/10 text-ember",
  },
  {
    href: "/admin/settings/cohorts",
    label: "기수 관리",
    description: "수험 유형별 기수(期數) 등록 및 기간 설정",
    group: "수강·강좌",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-ember/20 bg-ember/10 text-ember",
  },
  {
    href: "/admin/settings/special-lectures",
    label: "특강 단과",
    description: "특강·단과 강좌 등록, 과목별 강사·수강료·배분율 설정",
    group: "수강·강좌",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-ember/20 bg-ember/10 text-ember",
  },
  {
    href: "/admin/settings/lecture-schedules",
    label: "강의 스케줄",
    description: "기수별 강의 요일·시간·과목·강사 스케줄 설정",
    group: "수강·강좌",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-ember/20 bg-ember/10 text-ember",
  },
  {
    href: "/admin/settings/textbooks",
    label: "교재 관리",
    description: "교재 정보 및 재고 관리",
    group: "수강·강좌",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-ember/20 bg-ember/10 text-ember",
  },
  // 결제·할인
  {
    href: "/admin/settings/payment-policies",
    label: "결제 정책",
    description: "수납 및 환불 정책 기본값 설정",
    group: "결제·할인",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    href: "/admin/settings/refund-policies",
    label: "환불 정책",
    description: "학원법 제18조 기준 환불 비율 설정 및 법정 기준 참조",
    group: "결제·할인",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    href: "/admin/settings/discount-codes",
    label: "할인 코드 관리",
    description: "추천인·입소·캠페인 할인 코드 발급 및 관리",
    group: "결제·할인",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    href: "/admin/settings/approval-rules",
    label: "승인 라인",
    description: "환불·할인·현금 지급 승인 기준 금액 설정",
    group: "결제·할인",
    minRole: AdminRole.DIRECTOR,
    badgeColor: "border-sky-200 bg-sky-50 text-sky-700",
  },
  // 인원·시설
  {
    href: "/admin/settings/staff",
    label: "직원 관리",
    description: "직원 계정 권한 역할 및 연락처 관리",
    group: "인원·시설",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-purple-200 bg-purple-50 text-purple-700",
  },
  {
    href: "/admin/settings/instructors",
    label: "강사 관리",
    description: "강사 정보 및 정산 계좌 관리",
    group: "인원·시설",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-purple-200 bg-purple-50 text-purple-700",
  },
  {
    href: "/admin/settings/lockers",
    label: "사물함 초기 설정",
    description: "사물함 구역별 일괄 생성 및 관리",
    group: "인원·시설",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-purple-200 bg-purple-50 text-purple-700",
  },
  {
    href: "/admin/settings/study-rooms",
    label: "스터디룸 설정",
    description: "스터디룸 목록 등록 및 관리",
    group: "인원·시설",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-purple-200 bg-purple-50 text-purple-700",
  },
  // 학사·출결
  {
    href: "/admin/settings/academic-years",
    label: "학사연도 관리",
    description: "현재 운영 기수 현황 및 학사일정 관련 설정 허브",
    group: "학사·출결",
    minRole: AdminRole.DIRECTOR,
    badgeColor: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    href: "/admin/settings/absence-policies",
    label: "사유 정책",
    description: "사유별 출석 포함 및 개근 인정 기본값 관리",
    group: "학사·출결",
    minRole: AdminRole.TEACHER,
    badgeColor: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    href: "/admin/settings/attendance-keywords",
    label: "출결 키워드",
    description: "카카오톡 출결 메시지 파싱에 사용되는 키워드 목록 조회",
    group: "학사·출결",
    minRole: AdminRole.TEACHER,
    badgeColor: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    href: "/admin/settings/civil-exams",
    label: "공무원 시험 일정",
    description: "공채·경채 시험 일정 등록 및 관리",
    group: "학사·출결",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    href: "/admin/settings/point-policies",
    label: "포인트 정책",
    description: "포인트 지급 제도 템플릿 관리",
    group: "학사·출결",
    minRole: AdminRole.ACADEMIC_ADMIN,
    badgeColor: "border-amber-200 bg-amber-50 text-amber-700",
  },
  // 알림·계정
  {
    href: "/admin/settings/notification-rules",
    label: "알림 발송 규칙",
    description: "이벤트별 자동·수동 알림 규칙 확인 및 자동 트리거 ON/OFF 관리",
    group: "알림·계정",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-ink/20 bg-ink/5 text-slate",
  },
  {
    href: "/admin/settings/notifications",
    label: "SMS 알림 설정",
    description: "Solapi 키와 발신 번호 설정",
    group: "알림·계정",
    minRole: AdminRole.SUPER_ADMIN,
    badgeColor: "border-ink/20 bg-ink/5 text-slate",
  },
  {
    href: "/admin/settings/accounts",
    label: "관리자 계정",
    description: "Supabase Auth 연동 계정 관리",
    group: "알림·계정",
    minRole: AdminRole.SUPER_ADMIN,
    badgeColor: "border-ink/20 bg-ink/5 text-slate",
  },
  {
    href: "/admin/settings/audit-logs",
    label: "직원 감사 로그",
    description: "전체 관리자 작업 이력 조회 및 직원별 활동 필터링",
    group: "알림·계정",
    minRole: AdminRole.DEPUTY_DIRECTOR,
    badgeColor: "border-ink/20 bg-ink/5 text-slate",
  },
  // 데이터
  {
    href: "/admin/settings/data",
    label: "데이터 관리",
    description: "학생 데이터 가져오기·내보내기, 시스템 백업 허브",
    group: "데이터",
    minRole: AdminRole.MANAGER,
    badgeColor: "border-forest/20 bg-forest/10 text-forest",
  },
];

const GROUP_ORDER = ["학원", "수강·강좌", "결제·할인", "인원·시설", "학사·출결", "알림·계정", "데이터"];

export default async function SettingsHubPage() {
  const context = await requireAdminContext(AdminRole.TEACHER);

  const visibleCards = SETTINGS_CARDS.filter((card) => roleAtLeast(context.adminUser.role, card.minRole));
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    cards: visibleCards.filter((c) => c.group === group),
  })).filter((g) => g.cards.length > 0);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학원 운영에 필요한 강좌, 기수, 직원, 알림, 데이터 등 모든 설정을 관리합니다.
      </p>

      <div className="mt-10 space-y-10">
        {grouped.map(({ group, cards }) => (
          <div key={group}>
            <h2 className="text-lg font-semibold text-ink">{group}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  prefetch={false}
                  className="group flex flex-col gap-3 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-ember/30 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${card.badgeColor}`}
                    >
                      {card.group}
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
                      {card.label}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate">
                      {card.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
