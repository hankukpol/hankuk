import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";
import { RuleToggle } from "./rule-toggle";

export const dynamic = "force-dynamic";

// ─── Rule definitions ─────────────────────────────────────────────────────────

type RuleCategory = "수강 관련" | "수납 관련" | "출결 관련" | "마케팅" | "관리자 알림";

type RuleDef = {
  type: string;
  label: string;
  trigger: string;
  channel: string;
  category: RuleCategory;
  note?: string;
};

const RULE_DEFINITIONS: RuleDef[] = [
  // 수강 관련
  {
    type: "ENROLLMENT_COMPLETE",
    label: "수강 등록 완료",
    trigger: "수강 등록 처리 시 자동 발송 (수납 등록 API 호출 후)",
    channel: "카카오 알림톡",
    category: "수강 관련",
  },
  // 수납 관련
  {
    type: "PAYMENT_COMPLETE",
    label: "수납 완료",
    trigger: "결제 처리 완료 시 자동 발송 (/api/payments POST 성공 후)",
    channel: "카카오 알림톡",
    category: "수납 관련",
  },
  {
    type: "REFUND_COMPLETE",
    label: "환불 처리 완료",
    trigger: "환불 승인 시 자동 발송 (/api/payments/[id]/refund POST 성공 후)",
    channel: "카카오 알림톡",
    category: "수납 관련",
  },
  {
    type: "PAYMENT_OVERDUE",
    label: "미납 독촉 알림",
    trigger: "미납 관리 화면에서 건별 또는 일괄 수동 발송",
    channel: "카카오/SMS",
    category: "수납 관련",
    note: "분납 기한이 지난 학생 대상",
  },
  // 출결 관련
  {
    type: "WARNING_1",
    label: "1차 경고",
    trigger: "경고·탈락 판정 화면에서 수동 발송",
    channel: "카카오 알림톡",
    category: "출결 관련",
    note: "주간 무단 결시 1회 기준",
  },
  {
    type: "WARNING_2",
    label: "2차 경고",
    trigger: "경고·탈락 판정 화면에서 수동 발송",
    channel: "카카오 알림톡",
    category: "출결 관련",
    note: "주간 무단 결시 2회 기준",
  },
  {
    type: "DROPOUT",
    label: "탈락",
    trigger: "경고·탈락 판정 화면에서 수동 발송",
    channel: "카카오 알림톡",
    category: "출결 관련",
    note: "주간 3회 또는 월간 8회 초과 기준",
  },
  {
    type: "ABSENCE_NOTE",
    label: "사유서 처리 결과",
    trigger: "사유서 관리 화면에서 승인/반려 처리 후 수동 발송",
    channel: "카카오 알림톡",
    category: "출결 관련",
  },
  // 마케팅
  {
    type: "POINT",
    label: "포인트 지급",
    trigger: "포인트 직접 관리 화면에서 지급 시 수동 발송",
    channel: "카카오 알림톡",
    category: "마케팅",
  },
  {
    type: "NOTICE",
    label: "일반 공지",
    trigger: "알림 수동 발송 화면에서 개별·기수·전체 대상 발송",
    channel: "카카오 알림톡",
    category: "마케팅",
  },
  // 관리자 알림
  {
    type: "SCORE_DEADLINE",
    label: "성적 입력 마감 알림",
    trigger: "성적 미입력 건 발생 시 관리자 대상 수동 발송",
    channel: "카카오 알림톡",
    category: "관리자 알림",
    note: "담당 교사/관리자 수신",
  },
];

const CATEGORY_ORDER: RuleCategory[] = [
  "수강 관련",
  "수납 관련",
  "출결 관련",
  "마케팅",
  "관리자 알림",
];

const CATEGORY_BADGE: Record<RuleCategory, string> = {
  "수강 관련": "border-forest/20 bg-forest/10 text-forest",
  "수납 관련": "border-ember/20 bg-ember/10 text-ember",
  "출결 관련": "border-amber-200 bg-amber-50 text-amber-700",
  "마케팅": "border-purple-200 bg-purple-50 text-purple-700",
  "관리자 알림": "border-sky-200 bg-sky-50 text-sky-700",
};

// ─── Server helpers ───────────────────────────────────────────────────────────

async function getNotificationRules(): Promise<Record<string, boolean>> {
  try {
    const row = await getPrisma().systemConfig.findUnique({ where: { id: "singleton" } });
    if (!row) return {};
    const data = row.data as Record<string, unknown>;
    const saved = data.notificationRules;
    if (!saved || typeof saved !== "object") return {};
    return saved as Record<string, boolean>;
  } catch {
    return {};
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function NotificationRulesPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const savedRules = await getNotificationRules();

  // Resolve enabled state: default true if not explicitly set
  function isRuleEnabled(ruleType: string): boolean {
    if (typeof savedRules[ruleType] === "boolean") return savedRules[ruleType];
    return true;
  }

  const enabledCount = RULE_DEFINITIONS.filter((r) => isRuleEnabled(r.type)).length;
  const totalCount = RULE_DEFINITIONS.length;

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">알림 발송 규칙</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        각 이벤트별 알림 발송을 개별적으로 활성화·비활성화할 수 있습니다.
        비활성화된 규칙은 이벤트가 발생해도 알림이 발송되지 않습니다.
      </p>

      {/* 요약 뱃지 */}
      <div className="mt-6 flex flex-wrap gap-3">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest">
          <span className="h-2 w-2 rounded-full bg-forest" />
          활성 {enabledCount}개 / 전체 {totalCount}개
        </div>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-slate">
          토글을 클릭하면 즉시 저장됩니다
        </div>
      </div>

      {/* 카테고리별 규칙 */}
      <div className="mt-10 space-y-10">
        {CATEGORY_ORDER.map((category) => {
          const categoryRules = RULE_DEFINITIONS.filter((r) => r.category === category);
          if (categoryRules.length === 0) return null;

          const activeCategoryCount = categoryRules.filter((r) => isRuleEnabled(r.type)).length;

          return (
            <section key={category}>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-ink">{category}</h2>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_BADGE[category]}`}
                >
                  {activeCategoryCount}/{categoryRules.length} 활성
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                {categoryRules.map((rule) => (
                  <RuleToggle
                    key={rule.type}
                    ruleType={rule.type}
                    ruleName={rule.label}
                    description={rule.trigger}
                    isEnabled={isRuleEnabled(rule.type)}
                    channel={rule.channel}
                    note={rule.note}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* 발송 공통 조건 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">발송 공통 조건</h2>
        <div className="mt-5 rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8 shadow-panel">
          <ul className="space-y-3 text-sm text-slate">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                학생이 <strong className="font-semibold text-ink">수신 동의</strong>를 한 경우에만 자동
                발송됩니다. 미동의 학생에게는 발송되지 않습니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                카카오 알림톡 템플릿 ID(Solapi Template ID)가 설정된 경우 알림톡으로 발송되며, 미설정 시
                SMS로 대체 발송됩니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                자동 발송은{" "}
                <strong className="font-semibold text-ink">fire-and-forget</strong> 방식으로 처리되며,
                발송 실패는 로그에만 기록되고 처리 응답에 영향을 주지 않습니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                규칙을 비활성화해도 수동 발송 화면에서의 즉시 발송은 별도로 제어합니다. 이 설정은{" "}
                <strong className="font-semibold text-ink">자동 트리거</strong>에만 적용됩니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                모든 발송 내역은{" "}
                <strong className="font-semibold text-ink">알림 발송 이력</strong>에서 확인할 수
                있습니다.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* 바로가기 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">바로가기</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/settings/notification-templates"
            className="inline-flex items-center gap-2 rounded-2xl border border-forest/20 bg-forest/10 px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/20"
          >
            알림 템플릿 바로가기
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 11L11 3M11 3H6M11 3v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <Link
            href="/admin/settings/notifications"
            className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-mist shadow-panel"
          >
            발송 이력 확인
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 11L11 3M11 3H6M11 3v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <Link
            href="/admin/settings/sms"
            className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-mist shadow-panel"
          >
            SMS·알림 설정
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 11L11 3M11 3H6M11 3v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
