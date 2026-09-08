import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  CreditCard,
  GraduationCap,
  LayoutTemplate,
  MapPinned,
  Settings2,
  Star,
  UserCog,
} from "lucide-react";

import type { DivisionFeatureKey } from "@/lib/division-features";
import { getDivisionBySlug } from "@/lib/services/division.service";
import {
  getDivisionFeatureSettings,
  getDivisionGeneralSettings,
  getDivisionRuleSettings,
} from "@/lib/services/settings.service";

type SettingsHubPageProps = {
  params: {
    division: string;
  };
};

type SettingsSection = {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
  featureKey?: DivisionFeatureKey;
};

const sections: SettingsSection[] = [
  {
    key: "general",
    href: "settings/general",
    label: "기본 정보",
    description: "지점명, 전체 명칭, 색상, 운영 요일, 직렬 목록을 관리합니다.",
    icon: LayoutTemplate,
  },
  {
    key: "features",
    href: "settings/features",
    label: "기능 설정",
    description: "지점별로 공지, 상벌점, 시험 등 주요 기능의 사용 여부를 조정합니다.",
    icon: Settings2,
  },
  {
    key: "periods",
    href: "settings/periods",
    label: "교시 설정",
    description: "교시 시간표와 필수 여부를 지점 단위로 설정합니다.",
    icon: CalendarRange,
  },
  {
    key: "rules",
    href: "settings/rules",
    label: "운영 규칙",
    description: "지각 기준, 경고 한계, 휴가 시도, 조교 수정 범위를 관리합니다.",
    icon: AlarmClock,
  },
  {
    key: "tuition",
    href: "settings/tuition",
    label: "등록 기간 / 금액",
    description: "기간별 등록 플랜과 적용 금액을 지점에서 직접 설정합니다.",
    icon: CreditCard,
    featureKey: "paymentManagement",
  },
  {
    key: "seats",
    href: "settings/seats",
    label: "자습실 / 좌석",
    description: "자습실 구성, 좌석 배치, 학생 좌석 이동을 관리합니다.",
    icon: MapPinned,
    featureKey: "seatManagement",
  },
  {
    key: "exams",
    href: "settings/exams",
    label: "시험 설정",
    description: "시험 유형과 직렬별 과목 구성을 지점 단위로 관리합니다.",
    icon: GraduationCap,
    featureKey: "examManagement",
  },
  {
    key: "exam-schedules",
    href: "settings/exam-schedules",
    label: "시험 일정",
    description: "실제 시험 일정을 등록하고 학생 화면의 D-Day 노출을 제어합니다.",
    icon: CalendarDays,
    featureKey: "examScheduleManagement",
  },
  {
    key: "point-rules",
    href: "points/rules",
    label: "상벌점 규칙",
    description: "점수 규칙 목록과 자동 벌점 운영 기준을 설정합니다.",
    icon: Star,
    featureKey: "pointManagement",
  },
  {
    key: "staff",
    href: "staff",
    label: "직원 관리",
    description: "지점 관리자와 조교 계정을 추가, 수정, 비활성화하고 비밀번호를 재설정합니다.",
    icon: UserCog,
    featureKey: "staffManagement",
  },
];

export default async function SettingsHubPage({ params }: SettingsHubPageProps) {
  const [division, generalSettings, ruleSettings, featureSettings] = await Promise.all([
    getDivisionBySlug(params.division),
    getDivisionGeneralSettings(params.division),
    getDivisionRuleSettings(params.division),
    getDivisionFeatureSettings(params.division),
  ]);

  const activeOperatingDays = Object.values(generalSettings.operatingDays).filter(Boolean).length;
  const enabledFeatureCount = Object.values(featureSettings.featureFlags).filter(Boolean).length;
  const visibleSections = sections.filter(
    (section) => !section.featureKey || featureSettings.featureFlags[section.featureKey],
  );

  return (
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">운영 설정</h1>
        <p className="admin-page-description">
          교시, 운영 규칙, 지점 기본 정보, 직렬 목록, 등록 플랜, 좌석, 시험 구성을 이곳에서
          관리합니다. 모든 설정은 현재 지점에만 적용됩니다.
        </p>
      </section>

      {/* DESIGN.md 5.3 — 16px 간격의 독립 요약 박스. 색면 카드를 쓰지 않는다. */}
      <dl className="admin-metric-strip">
        <div className="admin-metric-box">
          <dt className="admin-metric-box-label">지점</dt>
          <dd className="admin-metric-box-value">{division?.name ?? generalSettings.name}</dd>
          <p className="admin-help mt-2 text-right">{generalSettings.fullName}</p>
        </div>
        <div className="admin-metric-box">
          <dt className="admin-metric-box-label">출결 규칙</dt>
          <dd className="admin-metric-box-value">{ruleSettings.tardyMinutes}분</dd>
          <p className="admin-help mt-2 text-right">
            조교 수정{" "}
            {ruleSettings.assistantPastEditAllowed
              ? `${ruleSettings.assistantPastEditDays}일 허용`
              : "당일만 허용"}
          </p>
        </div>
        <div className="admin-metric-box">
          <dt className="admin-metric-box-label">직렬 / 운영일</dt>
          <dd className="admin-metric-box-value">직렬 {generalSettings.studyTracks.length}개</dd>
          <p className="admin-help mt-2 text-right">
            주 {activeOperatingDays}일 운영 / 퇴소 기준 {ruleSettings.warnWithdraw}회
          </p>
        </div>
        <div className="admin-metric-box">
          <dt className="admin-metric-box-label">기능</dt>
          <dd className="admin-metric-box-value">{enabledFeatureCount}개 활성</dd>
          <p className="admin-help mt-2 text-right">
            비활성 기능은 메뉴와 주요 화면에서 함께 숨겨집니다.
          </p>
        </div>
      </dl>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map((section) => {

          return (
            <Link
              key={section.key}
              href={`/${params.division}/admin/${section.href}`}
              prefetch={false}
              className="group rounded-lg border border-admin-line bg-white p-5 transition hover:bg-admin-surface-soft"
            >
              <h2 className="admin-section-title">{section.label}</h2>
              <p className="admin-help mt-3 leading-6">{section.description}</p>

              <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                바로 이동
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
