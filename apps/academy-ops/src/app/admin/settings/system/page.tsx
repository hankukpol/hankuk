import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getAcademySettingsByAcademyId } from "@/lib/academy-settings";
import { getSystemConfig } from "@/lib/system-config";
import { SystemSettingsClient } from "./system-settings-client";

export const dynamic = "force-dynamic";

// PG 설정 정보 (확정된 비즈니스 규칙 — 코드 레벨 설정)
const PG_CONFIG = [
  {
    id: "portone",
    name: "포트원 (PortOne)",
    description: "온라인 결제 링크 발급 및 카드 결제 처리",
    status: "configured" as const,
    detail: "KG이니시스 / KSNET 갑(GAP) 연동",
    docs: "https://portone.io",
  },
  {
    id: "ksnet",
    name: "KSNET 갑(GAP)",
    description: "카드 단말기 및 현금영수증 발행 (POS 단말기)",
    status: "configured" as const,
    detail: "10만 원 이상 현금 결제 시 현금영수증 의무 발행",
    docs: "https://www.ksnet.co.kr",
  },
];

const STATUS_STYLES = {
  configured: {
    badge: "border-forest/20 bg-forest/10 text-forest",
    label: "설정 완료",
  },
  pending: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    label: "설정 필요",
  },
  inactive: {
    badge: "border-ink/10 bg-mist text-slate",
    label: "미사용",
  },
};

// 운영 시간 표시용 포맷
function formatTime(t: string) {
  const [h, m] = t.split(":");
  if (!h) return t;
  const hour = parseInt(h, 10);
  const ampm = hour < 12 ? "오전" : "오후";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${ampm} ${display}:${m}`;
}

export default async function SystemSettingsPage() {
  const context = await requireAdminContext(AdminRole.SUPER_ADMIN);
  const isAllAcademiesView = context.activeAcademyId === null;

  const [config, academyRow] = await Promise.all([
    getSystemConfig(),
    context.activeAcademyId
      ? getAcademySettingsByAcademyId(context.activeAcademyId)
      : Promise.resolve(null),
  ]);

  const academy = {
    name: academyRow?.name ?? "",
    directorName: academyRow?.directorName ?? "",
    businessRegNo: academyRow?.businessRegNo ?? "",
    academyRegNo: academyRow?.academyRegNo ?? "",
    address: academyRow?.address ?? "",
    phone: academyRow?.phone ?? "",
    bankName: academyRow?.bankName ?? "",
    bankAccount: academyRow?.bankAccount ?? "",
    bankHolder: academyRow?.bankHolder ?? "",
    websiteUrl: academyRow?.websiteUrl ?? "",
  };

  // 현재 저장된 학원명이 없으면 기본값으로 표시
  const displayName = isAllAcademiesView ? "전체 지점" : academy.name || "academy-ops 강남 캠퍼스";
  const displayAddress = academy.address || "서울특별시 강남구 테헤란로 123";
  const displayPhone = academy.phone || "02-555-1234";
  const displayWeekday = `${formatTime(config.weekdayOpen)} ~ ${formatTime(config.weekdayClose)}`;
  const displayWeekend = `${formatTime(config.weekendOpen)} ~ ${formatTime(config.weekendClose)}`;

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">통합 시스템 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학원 기본 정보, 운영 시간, 알림 채널, 수납 환불 정책을 한 곳에서 관리합니다.
      </p>

      {/* 현황 요약 카드 */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* 학원명 */}
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">학원명</p>
          <p className="mt-2 text-base font-semibold text-ink">{displayName}</p>
        </div>
        {/* 전화 */}
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">대표 전화</p>
          <p className="mt-2 text-base font-semibold text-ink">{displayPhone}</p>
        </div>
        {/* 평일 운영 */}
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">평일 운영</p>
          <p className="mt-2 text-sm font-semibold text-ink">{displayWeekday}</p>
        </div>
        {/* 주말 운영 */}
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">주말 운영</p>
          <p className="mt-2 text-sm font-semibold text-ink">{displayWeekend}</p>
        </div>
      </div>

      {/* 학원 주소 요약 */}
      <div className="mt-4 flex items-center gap-3 rounded-[20px] border border-ink/5 bg-mist/60 px-6 py-4">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="shrink-0 text-slate"
        >
          <path
            d="M8 1.5C5.79 1.5 4 3.29 4 5.5c0 3.375 4 9 4 9s4-5.625 4-9c0-2.21-1.79-3.5-4-3.5Zm0 4.75a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"
            fill="currentColor"
          />
        </svg>
        <p className="text-sm text-slate">
          <span className="font-semibold text-ink">{displayName}</span> —{" "}
          {displayAddress}
        </p>
      </div>

      {/* 설정 폼 */}
      {isAllAcademiesView ? (
        <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-700">
          현재 전체 지점 보기 모드입니다. 공통 운영 설정은 바로 수정할 수 있지만, 학원 기본 정보는 지점을 선택한 뒤 수정할 수 있습니다.
        </div>
      ) : null}

      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">설정 편집</h2>
        <p className="mt-1 text-sm text-slate">
          아래 항목을 수정 후 저장하면 전체 시스템에 즉시 반영됩니다.
        </p>
        <div className="mt-5 max-w-2xl">
          <SystemSettingsClient
            config={config}
            academy={academy}
            canEditAcademyInfo={!isAllAcademiesView}
          />
        </div>
      </div>

      {/* PG 연동 현황 */}
      <div className="mt-14">
        <h2 className="text-xl font-semibold text-ink">PG 연동 현황</h2>
        <p className="mt-1 text-sm text-slate">
          현재 시스템에 연동된 결제 게이트웨이입니다. 키 변경은 개발팀에 문의하세요.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {PG_CONFIG.map((pg) => {
            const style = STATUS_STYLES[pg.status];
            return (
              <div
                key={pg.id}
                className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel"
              >
                <div className="border-b border-ink/5 bg-mist/40 px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-ink">{pg.name}</h3>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}
                    >
                      {style.label}
                    </span>
                  </div>
                </div>
                <div className="space-y-3 px-6 py-5">
                  <p className="text-sm text-slate">{pg.description}</p>
                  <p className="text-xs text-slate/70">{pg.detail}</p>
                  <a
                    href={pg.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-forest transition hover:underline"
                  >
                    공식 문서
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 8L8 2M8 2H4M8 2v4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-[20px] border border-ink/5 bg-mist/60 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">PG 설정 안내</p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                포트원 API 키 및 웹훅 시크릿은{" "}
                <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs font-mono">.env.local</code>
                에서 관리합니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                KSNET POS 단말기 현금영수증 발행은 10만 원 이상 현금 결제 시 의무입니다 (소액도
                요청 시 발행).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                온라인 결제 링크 발급은{" "}
                <strong className="text-ink">수납 관리 → 결제 링크 발급</strong>에서 처리합니다.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
