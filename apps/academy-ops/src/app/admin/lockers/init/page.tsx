import { AdminRole, LockerZone } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerInitButton } from "./init-button";

export const dynamic = "force-dynamic";

const ZONE_LABEL: Record<LockerZone, string> = {
  CLASS_ROOM: "1강의실 방향 (1~120)",
  JIDEOK_LEFT: "지덕 좌 (A-1~A-40)",
  JIDEOK_RIGHT: "지덕 우 (121~168)",
};

const ZONE_TARGET: Record<LockerZone, number> = {
  CLASS_ROOM: 120,
  JIDEOK_LEFT: 40,
  JIDEOK_RIGHT: 48,
};

export default async function LockerInitPage() {
  await requireAdminContext(AdminRole.SUPER_ADMIN);

  // Current locker counts per zone
  const counts = await getPrisma().locker.groupBy({
    by: ["zone"],
    _count: { _all: true },
  });

  const countByZone = Object.fromEntries(
    counts.map((c) => [c.zone, c._count._all]),
  ) as Partial<Record<LockerZone, number>>;

  const totalExisting = counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/lockers" className="hover:text-ink">
          사물함 관리
        </Link>
        <span>/</span>
        <span className="text-ink">사물함 초기화</span>
      </nav>

      {/* Header */}
      <div className="mt-5 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-3">
        <h1 className="text-3xl font-semibold">사물함 초기화</h1>
        <p className="mt-2 max-w-2xl text-sm leading-8 text-slate sm:text-base">
          현재 학원의 사물함 레이아웃을 DB에 일괄 등록합니다.
          이미 존재하는 사물함은 건너뜁니다.
        </p>
      </div>

      {/* Current status */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-ink">현재 구역별 사물함 현황</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(Object.keys(ZONE_LABEL) as LockerZone[]).map((zone) => {
            const current = countByZone[zone] ?? 0;
            const target = ZONE_TARGET[zone];
            const isFull = current >= target;
            return (
              <div
                key={zone}
                className={`rounded-[20px] border p-5 ${
                  isFull
                    ? "border-forest/20 bg-forest/5"
                    : "border-ink/10 bg-white"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                  {zone.replace("_", " ")}
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {ZONE_LABEL[zone]}
                </p>
                <div className="mt-3 flex items-end gap-1.5">
                  <span
                    className={`text-2xl font-bold ${isFull ? "text-forest" : "text-ember"}`}
                  >
                    {current}
                  </span>
                  <span className="mb-0.5 text-sm text-slate">/ {target}개</span>
                </div>
                {isFull && (
                  <span className="mt-2 inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-[10px] font-semibold text-forest">
                    완료
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Overall summary */}
        <div className="mt-4 rounded-[20px] border border-ink/10 bg-mist p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">전체 등록 현황</p>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                totalExisting >= 208
                  ? "border-forest/20 bg-forest/10 text-forest"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {totalExisting} / 208 개
            </span>
          </div>
          {totalExisting >= 208 && (
            <p className="mt-1.5 text-xs text-slate">
              모든 사물함이 이미 등록되어 있습니다. 초기화를 실행해도 새로 생성되는 항목이 없습니다.
            </p>
          )}
        </div>
      </div>

      {/* Init section */}
      <div className="mt-8 max-w-xl rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-base font-semibold text-ink">208 사물함 초기화</h2>
        <p className="mt-1.5 text-sm text-slate">
          아래 버튼을 클릭하면 3개 구역 208개 사물함이 일괄 등록됩니다.
          이미 존재하는 사물함은 건너뜁니다.
        </p>

        <div className="mt-5">
          <LockerInitButton />
        </div>
      </div>

      {/* Layout reference */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-ink">사물함 레이아웃 참조</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10">
                <th className="pb-2 text-left font-semibold text-ink">구역</th>
                <th className="pb-2 text-left font-semibold text-ink">번호 범위</th>
                <th className="pb-2 text-right font-semibold text-ink">개수</th>
                <th className="pb-2 text-right font-semibold text-ink">그리드</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              <tr>
                <td className="py-3 font-medium text-ink">1강의실 방향</td>
                <td className="py-3 text-slate">1 ~ 120</td>
                <td className="py-3 text-right text-slate">120개</td>
                <td className="py-3 text-right text-slate">10행 × 12열</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-ink">지덕 좌</td>
                <td className="py-3 text-slate">A-1 ~ A-40</td>
                <td className="py-3 text-right text-slate">40개</td>
                <td className="py-3 text-right text-slate">5행 × 8열</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-ink">지덕 우</td>
                <td className="py-3 text-slate">121 ~ 168</td>
                <td className="py-3 text-right text-slate">48개</td>
                <td className="py-3 text-right text-slate">6행 × 8열</td>
              </tr>
              <tr className="border-t border-ink/10 font-semibold">
                <td className="py-3 text-ink">합계</td>
                <td className="py-3 text-slate" />
                <td className="py-3 text-right text-ink">208개</td>
                <td className="py-3 text-right text-slate" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
