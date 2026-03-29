import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { getPrisma } from "@/lib/prisma";
import { getOrCreatePointBalance } from "@/lib/points/balance";

export const dynamic = "force-dynamic";

function maskName(name: string): string {
  if (name.length <= 1) return name + "*";
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

type LeaderboardEntry = {
  rank: number;
  maskedName: string;
  balance: number;
  isMe: boolean;
};

type MyRankInfo = {
  rank: number;
  balance: number;
} | null;

export default async function StudentPointsLeaderboardPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-4 py-4">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Unavailable
          </div>
          <h1 className="mt-4 text-2xl font-semibold">리더보드를 불러올 수 없습니다</h1>
          <p className="mt-2 text-sm text-slate">데이터베이스 연결 후 사용할 수 있습니다.</p>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-4 py-4">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Points Leaderboard
          </div>
          <h1 className="mt-4 text-2xl font-semibold leading-tight">
            포인트 리더보드
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate">
            포인트 순위를 확인하려면 로그인이 필요합니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/points/leaderboard" />
      </main>
    );
  }

  const prisma = getPrisma();

  // Get all students' point balances (aggregated from point_logs)
  const balanceGroups = await prisma.pointLog.groupBy({
    by: ["examNumber"],
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });

  // Filter to only positive balances and active students
  const activeStudents = await prisma.student.findMany({
    where: {
      examNumber: { in: balanceGroups.map((g) => g.examNumber) },
      isActive: true,
    },
    select: { examNumber: true, name: true },
  });
  const activeSet = new Set(activeStudents.map((s) => s.examNumber));
  const nameMap = new Map(activeStudents.map((s) => [s.examNumber, s.name]));

  // Build ranked list
  const ranked: Array<{ examNumber: string; name: string; balance: number; rank: number }> = [];
  for (const group of balanceGroups) {
    if (!activeSet.has(group.examNumber)) continue;
    const balance = group._sum.amount ?? 0;
    if (balance <= 0) continue;
    ranked.push({
      examNumber: group.examNumber,
      name: nameMap.get(group.examNumber) ?? "?",
      balance,
      rank: ranked.length + 1,
    });
    if (ranked.length >= 20) break;
  }

  // My rank
  let myRank: MyRankInfo = null;
  const myEntry = ranked.find((r) => r.examNumber === viewer.examNumber);
  if (myEntry) {
    myRank = { rank: myEntry.rank, balance: myEntry.balance };
  } else {
    // Calculate my balance and rough rank if not in top 20
    const myBalance = await getOrCreatePointBalance(viewer.examNumber);
    if (myBalance > 0) {
      // Count how many active students have more balance
      const countAbove = ranked.filter((r) => r.balance > myBalance).length;
      // If not in top 20, rank is at least 21
      myRank = { rank: countAbove + 1, balance: myBalance };
    }
  }

  // Build anonymized leaderboard for display
  const leaderboard: LeaderboardEntry[] = ranked.map((r) => ({
    rank: r.rank,
    maskedName: maskName(r.name),
    balance: r.balance,
    isMe: r.examNumber === viewer.examNumber,
  }));

  // My current month points (from point_logs this month)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const myMonthAgg = await prisma.pointLog.aggregate({
    where: {
      examNumber: viewer.examNumber,
      amount: { gt: 0 },
      grantedAt: { gte: monthStart },
    },
    _sum: { amount: true },
  });
  const myMonthPoints = myMonthAgg._sum.amount ?? 0;

  return (
    <main className="space-y-4 py-4">
      {/* Header */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Points Leaderboard
            </div>
            <h1 className="mt-4 text-2xl font-semibold leading-tight">
              포인트 리더보드
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate">
              현재 포인트 잔액 기준 상위 20명 순위입니다.
            </p>
          </div>
          <Link
            href="/student/points"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium transition hover:border-ember/30 hover:text-ember"
          >
            내 포인트
          </Link>
        </div>

        {/* My rank highlight */}
        {myRank && (
          <div className="mt-5 rounded-[20px] bg-gradient-to-r from-ember/90 to-[#a84d0e] p-4 text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium opacity-80">나의 순위</p>
                <p className="mt-1 text-2xl font-bold">{myRank.rank}위</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium opacity-80">현재 잔액</p>
                <p className="mt-1 text-2xl font-bold">
                  {myRank.balance.toLocaleString()}P
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium opacity-80">이번달 적립</p>
                <p className="mt-1 text-2xl font-bold">
                  +{myMonthPoints.toLocaleString()}P
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Leaderboard Table */}
      <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        <div className="px-5 py-4 border-b border-ink/8">
          <h2 className="text-sm font-semibold text-ink">
            포인트 잔액 순위 (상위 20명)
          </h2>
          <p className="mt-0.5 text-xs text-slate">
            이름은 개인정보 보호를 위해 일부 마스킹 처리됩니다
          </p>
        </div>

        {leaderboard.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate">
            현재 포인트 보유 학생이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-ink/5">
            {leaderboard.map((entry) => (
              <li
                key={entry.rank}
                className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${
                  entry.isMe
                    ? "bg-ember/5 border-l-2 border-ember"
                    : "hover:bg-mist/40"
                }`}
              >
                <RankBadge rank={entry.rank} isMe={entry.isMe} />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold ${
                      entry.isMe ? "text-ember" : "text-ink"
                    }`}
                  >
                    {entry.maskedName}
                    {entry.isMe && (
                      <span className="ml-2 inline-flex rounded-full bg-ember/15 px-2 py-0.5 text-[10px] font-bold text-ember">
                        나
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-bold ${
                      entry.isMe ? "text-ember" : "text-forest"
                    }`}
                  >
                    {entry.balance.toLocaleString()}P
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* My rank if outside top 20 */}
      {myRank && !myEntry && (
        <section className="rounded-[28px] border border-ember/20 bg-ember/5 p-5 shadow-panel">
          <p className="text-xs font-medium text-slate">
            나는 상위 20위 밖에 있습니다.
          </p>
          <div className="mt-2 flex items-center gap-4">
            <div>
              <p className="text-xs text-slate">현재 순위</p>
              <p className="text-xl font-bold text-ember">{myRank.rank}위</p>
            </div>
            <div>
              <p className="text-xs text-slate">현재 잔액</p>
              <p className="text-xl font-bold text-ember">
                {myRank.balance.toLocaleString()}P
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate">
            포인트를 더 모아 상위권에 도전해 보세요!
          </p>
        </section>
      )}

      {/* Bottom nav */}
      <div className="flex gap-3 flex-wrap pb-2">
        <Link
          href="/student/points"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium transition hover:border-ember/30 hover:text-ember"
        >
          내 포인트 이력
        </Link>
        <Link
          href="/student"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium transition hover:border-ember/30 hover:text-ember"
        >
          포털 홈
        </Link>
      </div>
    </main>
  );
}

function RankBadge({ rank, isMe }: { rank: number; isMe: boolean }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-white shadow-sm">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-400 text-sm font-bold text-white shadow-sm">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-700 text-sm font-bold text-white shadow-sm">
        3
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
        isMe
          ? "border-ember/30 bg-ember/10 text-ember"
          : "border-ink/10 bg-mist text-slate"
      }`}
    >
      {rank}
    </span>
  );
}
