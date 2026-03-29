import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { KeywordManager } from "./keyword-manager";
import {
  DEFAULT_PRESENT_KEYWORDS,
  DEFAULT_ABSENT_KEYWORDS,
  type AttendanceKeywordsConfig,
} from "@/app/api/settings/attendance-keywords/route";

export const dynamic = "force-dynamic";

async function getAttendanceKeywordsFromConfig(): Promise<AttendanceKeywordsConfig> {
  try {
    const prisma = getPrisma();
    const row = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
    if (!row) return { present: DEFAULT_PRESENT_KEYWORDS, absent: DEFAULT_ABSENT_KEYWORDS };
    const raw = row.data as Record<string, unknown>;
    const cfg = raw.attendanceKeywords as AttendanceKeywordsConfig | undefined;
    return {
      present:
        Array.isArray(cfg?.present) && cfg.present.length > 0
          ? (cfg.present as string[])
          : DEFAULT_PRESENT_KEYWORDS,
      absent:
        Array.isArray(cfg?.absent) && cfg.absent.length > 0
          ? (cfg.absent as string[])
          : DEFAULT_ABSENT_KEYWORDS,
    };
  } catch {
    return { present: DEFAULT_PRESENT_KEYWORDS, absent: DEFAULT_ABSENT_KEYWORDS };
  }
}

export default async function AttendanceKeywordsSettingsPage() {
  const { adminUser } = await requireAdminContext(AdminRole.TEACHER);
  const keywords = await getAttendanceKeywordsFromConfig();

  const canEdit =
    adminUser.role === AdminRole.MANAGER ||
    adminUser.role === AdminRole.DEPUTY_DIRECTOR ||
    adminUser.role === AdminRole.DIRECTOR ||
    adminUser.role === AdminRole.SUPER_ADMIN;

  const totalKeywords = keywords.present.length + keywords.absent.length;

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">출결 키워드 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        카카오톡 채팅 내보내기 파일을 파싱할 때 출석·결석 유형을 판별하는 키워드 목록입니다.
        담임반 관리 화면에서 카카오톡 내보내기 파일을 업로드하면 여기에서 설정한 키워드가 자동으로
        적용됩니다.
      </p>

      {/* 현황 요약 카드 */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">총 키워드</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalKeywords}</p>
          <p className="mt-1 text-xs text-slate">전체 키워드 수</p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">출석</p>
          <p className="mt-2 text-3xl font-bold text-ink">{keywords.present.length}</p>
          <p className="mt-1 text-xs text-slate">출석 키워드 수</p>
        </div>
        <div className="rounded-[24px] border border-red-200 bg-red-50/50 px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-600">결석</p>
          <p className="mt-2 text-3xl font-bold text-ink">{keywords.absent.length}</p>
          <p className="mt-1 text-xs text-slate">결석 키워드 수</p>
        </div>
        <div
          className={`rounded-[24px] border px-5 py-4 shadow-panel ${
            canEdit
              ? "border-forest/20 bg-forest/5"
              : "border-amber-200 bg-amber-50/50"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-widest ${
              canEdit ? "text-forest" : "text-amber-700"
            }`}
          >
            권한
          </p>
          <p className="mt-2 text-base font-semibold text-ink">
            {canEdit ? "편집 가능" : "읽기 전용"}
          </p>
          <p className={`mt-1 text-xs ${canEdit ? "text-forest" : "text-amber-700"}`}>
            {canEdit ? "매니저 이상 편집 권한" : "TEACHER 권한은 조회만 가능"}
          </p>
        </div>
      </div>

      {/* 소스 파일 안내 */}
      <div className="mt-4 flex items-center gap-3 rounded-[20px] border border-ink/5 bg-mist/60 px-6 py-4">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-slate">
          <path
            d="M3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5v11A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-11ZM4.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-7Z"
            fill="currentColor"
          />
          <path
            d="M6 5h4M6 7.5h4M6 10h2.5"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-sm text-slate">
          키워드는{" "}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs font-mono text-ink">
            SystemConfig
          </code>{" "}
          에 저장되며, 저장하지 않으면{" "}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs font-mono text-ink">
            kakao-parser.ts
          </code>{" "}
          의 기본값이 사용됩니다.
        </p>
      </div>

      {/* 키워드 관리 */}
      <div className="mt-10">
        <h2 className="mb-6 text-xl font-semibold text-ink">키워드 관리</h2>
        <KeywordManager
          initialPresent={keywords.present}
          initialAbsent={keywords.absent}
          canEdit={canEdit}
        />
      </div>

      {/* 하단 사용 안내 */}
      <div className="mt-10 rounded-[24px] border border-ink/5 bg-mist/60 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate">사용 안내</p>
        <ul className="mt-3 space-y-2 text-sm text-slate">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-forest">·</span>
            <span>
              이 키워드들은{" "}
              <strong className="text-ink">카카오톡 출결 메시지 파싱</strong>에 사용됩니다.
              담임반 관리 화면에서 카카오톡 내보내기 파일을 업로드하면 자동으로 적용됩니다.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-forest">·</span>
            <span>
              파싱 로직은 메시지 텍스트에 위 키워드가{" "}
              <strong className="text-ink">포함</strong>되어 있는지 확인합니다 (정확히 일치하지 않아도 됩니다).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-forest">·</span>
            <span>
              출석 키워드와 결석 키워드가 모두 포함된 메시지는{" "}
              <strong className="text-ink">출석 키워드가 우선</strong> 적용됩니다.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-forest">·</span>
            <span>
              저장 후 즉시 반영되며, 서버 재시작은 필요하지 않습니다.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
