'use client';

import { getAgeBracket } from '@/lib/study-group/algorithm';
import { OptimizationMetrics, StudyGroup } from '@/lib/study-group/types';

interface GroupResultProps {
  groups: StudyGroup[];
  warnings: string[];
  metrics?: OptimizationMetrics;
  lockedMemberIds?: string[];
}

function getRegionCounts(group: StudyGroup): [string, number][] {
  const counts: Record<string, number> = {};
  for (const member of group.members) {
    const key = member.region || '미분류';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function countAgeBrackets(group: StudyGroup) {
  const counts = { A: 0, B: 0, C: 0, D: 0 };

  for (const member of group.members) {
    const ageBracket = getAgeBracket(member.age);
    if (ageBracket) {
      counts[ageBracket] += 1;
    }
  }

  return counts;
}

export default function GroupResult({
  groups,
  warnings,
  metrics,
  lockedMemberIds = [],
}: GroupResultProps) {
  const hasScores = groups.some((group) =>
    group.members.some((member) => member.score !== undefined)
  );
  const hasAges = groups.some((group) =>
    group.members.some((member) => member.age !== undefined)
  );
  const lockedIdSet = new Set(lockedMemberIds);

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <h4 className="mb-1 text-sm font-semibold text-yellow-800">경고</h4>
          <ul className="space-y-1 text-xs text-yellow-700">
            {warnings.map((warning, index) => (
              <li key={index}>- {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {metrics && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap gap-3 text-sm text-slate-700">
            <span>총 페널티 {metrics.totalPenalty.toFixed(2)}</span>
            <span>반복 {metrics.iterations}회</span>
            <span>스왑 {metrics.swapsPerformed}회</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-600">
            <span className="rounded bg-white px-2 py-0.5">
              성별 {metrics.penaltyBreakdown.gender.toFixed(2)}
            </span>
            <span className="rounded bg-white px-2 py-0.5">
              나이 {metrics.penaltyBreakdown.ageBracket.toFixed(2)}
            </span>
            <span className="rounded bg-white px-2 py-0.5">
              지역 {metrics.penaltyBreakdown.region.toFixed(2)}
            </span>
            <span className="rounded bg-white px-2 py-0.5">
              직렬 {metrics.penaltyBreakdown.series.toFixed(2)}
            </span>
            <span className="rounded bg-white px-2 py-0.5">
              성적 {metrics.penaltyBreakdown.score.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        <span>총 {groups.length}개 조</span>
        <span>총 {groups.reduce((sum, group) => sum + group.members.length, 0)}명</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const maleCount = group.members.filter((member) => member.gender === 'male').length;
          const femaleCount = group.members.length - maleCount;
          const regionCounts = getRegionCounts(group);
          const ageBracketCounts = countAgeBrackets(group);

          const seriesCounts = group.members.reduce<Record<string, number>>((acc, member) => {
            const key = member.series || '미분류';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {});

          const scoredMembers = group.members.filter((member) => member.score !== undefined);
          const avgScore =
            scoredMembers.length > 0
              ? scoredMembers.reduce((sum, member) => sum + member.score!, 0) /
                scoredMembers.length
              : null;

          return (
            <div key={group.groupNumber} className="overflow-hidden rounded-lg border">
              <div className="space-y-2 bg-blue-600 px-4 py-3 text-white">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold">{group.groupNumber}조</span>
                  <span className="text-xs opacity-90">
                    {group.members.length}명 / 남 {maleCount} / 여 {femaleCount}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {regionCounts.slice(0, 4).map(([region, count]) => (
                    <span key={region} className="rounded bg-blue-500 px-2 py-0.5">
                      {region} {count}
                    </span>
                  ))}
                  {hasScores && avgScore !== null && (
                    <span className="rounded bg-blue-500 px-2 py-0.5">
                      평균 {avgScore.toFixed(1)}
                    </span>
                  )}
                  {hasAges && (
                    <span className="rounded bg-blue-500 px-2 py-0.5">
                      A:{ageBracketCounts.A} B:{ageBracketCounts.B} C:{ageBracketCounts.C} D:
                      {ageBracketCounts.D}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-b px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(seriesCounts).map(([series, count]) => (
                    <span
                      key={series}
                      className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                    >
                      {series} {count}
                    </span>
                  ))}
                </div>
              </div>

              <div className="divide-y">
                {group.members.map((member, index) => {
                  const ageBracket = getAgeBracket(member.age);
                  const isLocked = lockedIdSet.has(member.id);

                  return (
                    <div
                      key={member.id}
                      className={`flex flex-wrap items-center gap-2 px-4 py-2 text-sm ${
                        isLocked ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-5 text-xs text-gray-400">{index + 1}</span>
                      <span className="min-w-0 flex-1 font-medium text-gray-800">
                        {member.name}
                      </span>
                      {isLocked && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                          고정
                        </span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          member.gender === 'male'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-pink-50 text-pink-700'
                        }`}
                      >
                        {member.gender === 'male' ? '남' : '여'}
                      </span>
                      <span className="text-xs text-gray-500">{member.series || '-'}</span>
                      <span className="text-xs text-gray-500">
                        {member.region || '-'}
                      </span>
                      {hasAges && (
                        <span className="text-xs text-gray-500">
                          {member.age !== undefined
                            ? `${member.age}세${ageBracket ? ` [${ageBracket}]` : ''}`
                            : '-'}
                        </span>
                      )}
                      {hasScores && (
                        <span className="text-xs text-gray-500">
                          {member.score !== undefined ? member.score : '-'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
