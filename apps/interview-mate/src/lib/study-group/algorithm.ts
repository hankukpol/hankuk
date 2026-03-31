import {
  AgeBracket,
  AssignmentResult,
  ExamType,
  GroupSettings,
  Member,
  OptimizationMetrics,
  PenaltyWeights,
  StudyGroup,
} from './types';

const MAX_ITERATIONS = 1000;
const EPSILON = 0.0001;

const SINGLETON_PENALTY = 50; // 짝수 배치 필수 직렬의 1인 배치 페널티

interface GlobalStats {
  avgScore: number;
  stdScore: number;
  scoredRatio: number;
  agedRatio: number;
  experiencedRatio: number;
  ageBracketRatios: Record<AgeBracket, number>;
  targetFemaleRatio: number;
  seriesIdealMax: Record<string, number>;
  examType: ExamType;
  regionIdealMax: Record<string, number>;
  regionGenderIdealMax: Record<string, number>;
  pairRequiredSeries: string[];
}

interface HardConstraintResult {
  groups: StudyGroup[];
  assignedIds: Set<string>;
  lockedIds: Set<string>;
  warnings: string[];
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createEmptyWeights(): PenaltyWeights {
  return {
    gender: 0,
    ageBracket: 0,
    region: 0,
    series: 0,
    score: 0,
    interviewExperience: 0,
  };
}

function getNormalizedSettings(settings: GroupSettings): {
  normalized: GroupSettings;
  warnings: string[];
} {
  const warnings: string[] = [];
  const normalizedMax = Math.max(1, settings.groupSize.max || 1);
  const normalizedMin = Math.max(1, Math.min(settings.groupSize.min || 1, normalizedMax));

  if (
    normalizedMax !== settings.groupSize.max ||
    normalizedMin !== settings.groupSize.min
  ) {
    warnings.push('조 인원 설정이 잘못되어 허용 범위로 보정했습니다.');
  }

  return {
    normalized: {
      ...settings,
      groupSize: {
        min: normalizedMin,
        max: normalizedMax,
      },
      genderRatio: { ...settings.genderRatio },
      forceAssignRules: settings.forceAssignRules
        .filter((rule) => rule.countPerGroup > 0)
        .map((rule) => ({ ...rule })),
      penaltyWeights: { ...settings.penaltyWeights },
      pairRequiredSeries: [...(settings.pairRequiredSeries ?? [])],
    },
    warnings,
  };
}

export function getAgeBracket(age?: number): AgeBracket | null {
  if (typeof age !== 'number' || Number.isNaN(age)) {
    return null;
  }
  if (age <= 24) {
    return 'A';
  }
  if (age <= 27) {
    return 'B';
  }
  if (age <= 30) {
    return 'C';
  }
  return 'D';
}

export function isDaeguGyeongbuk(region: string): boolean {
  return region.includes('대구') || region.includes('경북');
}

function getTargetFemaleRatio(members: Member[], settings: GroupSettings): number {
  const { genderRatio } = settings;
  if (
    genderRatio.mode === 'manual' &&
    genderRatio.maleRatio !== undefined &&
    genderRatio.femaleRatio !== undefined
  ) {
    const ratioTotal = genderRatio.maleRatio + genderRatio.femaleRatio;
    if (ratioTotal > 0) {
      return genderRatio.femaleRatio / ratioTotal;
    }
  }

  const femaleCount = members.filter((member) => member.gender === 'female').length;
  return members.length > 0 ? femaleCount / members.length : 0;
}

export function computeGlobalStats(
  members: Member[],
  totalGroups: number,
  settings: GroupSettings
): GlobalStats {
  const scoredMembers = members.filter((member) => member.score !== undefined);
  const agedMembers = members.filter((member) => getAgeBracket(member.age) !== null);
  const experiencedMembers = members.filter(
    (member) => member.interviewExperience !== undefined && member.interviewExperience !== null
  );
  const scoredRatio = members.length > 0 ? scoredMembers.length / members.length : 0;
  const agedRatio = members.length > 0 ? agedMembers.length / members.length : 0;
  const experiencedRatio =
    experiencedMembers.length > 0
      ? experiencedMembers.filter((member) => member.interviewExperience === true).length /
        experiencedMembers.length
      : 0;
  const avgScore =
    scoredMembers.length > 0
      ? scoredMembers.reduce((sum, member) => sum + member.score!, 0) / scoredMembers.length
      : 0;
  const variance =
    scoredMembers.length > 0
      ? scoredMembers.reduce(
          (sum, member) => sum + (member.score! - avgScore) ** 2,
          0
        ) / scoredMembers.length
      : 0;
  const stdScore = Math.sqrt(variance);

  // 지역별 인원수 (경찰용: 지역 기준)
  const regionCounts: Record<string, number> = {};
  for (const member of members) {
    const key = member.region || '미분류';
    regionCounts[key] = (regionCounts[key] || 0) + 1;
  }
  const regionIdealMax: Record<string, number> = {};
  for (const [region, count] of Object.entries(regionCounts)) {
    regionIdealMax[region] = totalGroups > 0 ? Math.ceil(count / totalGroups) : count;
  }

  // 지역+성별 인원수 (소방용: 지역+성별 기준)
  const regionGenderCounts: Record<string, number> = {};
  for (const member of members) {
    const key = `${member.region || '미분류'}|${member.gender}`;
    regionGenderCounts[key] = (regionGenderCounts[key] || 0) + 1;
  }
  const regionGenderIdealMax: Record<string, number> = {};
  for (const [key, count] of Object.entries(regionGenderCounts)) {
    regionGenderIdealMax[key] = totalGroups > 0 ? Math.ceil(count / totalGroups) : count;
  }

  const ageBracketCounts: Record<AgeBracket, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
  };
  for (const member of agedMembers) {
    const ageBracket = getAgeBracket(member.age);
    if (ageBracket) {
      ageBracketCounts[ageBracket] += 1;
    }
  }
  const ageBracketRatios: Record<AgeBracket, number> = {
    A: agedMembers.length > 0 ? ageBracketCounts.A / agedMembers.length : 0,
    B: agedMembers.length > 0 ? ageBracketCounts.B / agedMembers.length : 0,
    C: agedMembers.length > 0 ? ageBracketCounts.C / agedMembers.length : 0,
    D: agedMembers.length > 0 ? ageBracketCounts.D / agedMembers.length : 0,
  };

  const seriesCounts: Record<string, number> = {};
  for (const member of members) {
    const key = member.series || '미분류';
    seriesCounts[key] = (seriesCounts[key] || 0) + 1;
  }

  const seriesIdealMax: Record<string, number> = {};
  for (const [series, count] of Object.entries(seriesCounts)) {
    seriesIdealMax[series] = totalGroups > 0 ? Math.ceil(count / totalGroups) : count;
  }

  return {
    avgScore,
    stdScore,
    scoredRatio,
    agedRatio,
    experiencedRatio,
    ageBracketRatios,
    targetFemaleRatio: getTargetFemaleRatio(members, settings),
    seriesIdealMax,
    examType: settings.examType,
    regionIdealMax,
    pairRequiredSeries: settings.pairRequiredSeries ?? [],
    regionGenderIdealMax,
  };
}

export function calcGroupPenalty(
  group: StudyGroup,
  weights: PenaltyWeights,
  stats: GlobalStats
): number {
  if (group.members.length === 0) {
    return 0;
  }

  let penalty = 0;

  if (weights.gender > 0) {
    const femaleCount = group.members.filter((member) => member.gender === 'female').length;
    const targetFemaleCount = group.members.length * stats.targetFemaleRatio;
    penalty += Math.abs(femaleCount - targetFemaleCount) * weights.gender;
  }

  if (weights.ageBracket > 0 && stats.agedRatio > 0) {
    const ageCounts: Record<AgeBracket, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    };
    let agedMemberCount = 0;

    for (const member of group.members) {
      const ageBracket = getAgeBracket(member.age);
      if (ageBracket) {
        ageCounts[ageBracket] += 1;
        agedMemberCount += 1;
      }
    }

    penalty +=
      Math.abs(agedMemberCount / group.members.length - stats.agedRatio) *
      weights.ageBracket;

    for (const [ageBracket, count] of Object.entries(ageCounts) as [AgeBracket, number][]) {
      const targetCount = agedMemberCount * stats.ageBracketRatios[ageBracket];
      penalty += Math.abs(count - targetCount) * weights.ageBracket;
    }
  }

  if (weights.region > 0) {
    if (stats.examType === 'police') {
      // 경찰: 같은 지역 출신 분산 (성별 무관, 남녀통합 면접)
      const regionCounts: Record<string, number> = {};
      for (const m of group.members) {
        const key = m.region || '미분류';
        regionCounts[key] = (regionCounts[key] || 0) + 1;
      }
      for (const [region, count] of Object.entries(regionCounts)) {
        const idealMax = stats.regionIdealMax[region] ?? count;
        penalty += Math.max(0, count - idealMax) ** 2 * weights.region;
      }
    } else {
      // 소방: 같은 지역 + 같은 성별 분산 (같은 지역 다른 성별은 괜찮음)
      const rgCounts: Record<string, number> = {};
      for (const m of group.members) {
        const key = `${m.region || '미분류'}|${m.gender}`;
        rgCounts[key] = (rgCounts[key] || 0) + 1;
      }
      for (const [key, count] of Object.entries(rgCounts)) {
        const idealMax = stats.regionGenderIdealMax[key] ?? count;
        penalty += Math.max(0, count - idealMax) ** 2 * weights.region;
      }
    }
  }

  if (weights.series > 0) {
    const seriesCounts: Record<string, number> = {};
    for (const member of group.members) {
      const key = member.series || '미분류';
      seriesCounts[key] = (seriesCounts[key] || 0) + 1;
    }

    for (const [series, count] of Object.entries(seriesCounts)) {
      const idealMax = stats.seriesIdealMax[series] ?? count;
      penalty += Math.max(0, count - idealMax) * weights.series;
    }
  }

  if (weights.score > 0 && stats.scoredRatio > 0) {
    const scoredMembers = group.members.filter((member) => member.score !== undefined);
    const groupScoredRatio = scoredMembers.length / group.members.length;
    penalty += Math.abs(groupScoredRatio - stats.scoredRatio) * weights.score;

    if (stats.stdScore > 0 && scoredMembers.length > 0) {
      const groupAvgScore =
        scoredMembers.reduce((sum, member) => sum + member.score!, 0) / scoredMembers.length;
      penalty +=
        (Math.abs(groupAvgScore - stats.avgScore) / stats.stdScore) * weights.score;
    }
  }

  if (weights.interviewExperience > 0) {
    const experiencedMembers = group.members.filter(
      (member) =>
        member.interviewExperience !== undefined && member.interviewExperience !== null
    );

    if (experiencedMembers.length > 0) {
      const experiencedCount = experiencedMembers.filter(
        (member) => member.interviewExperience === true
      ).length;
      const targetExperiencedCount =
        experiencedMembers.length * stats.experiencedRatio;

      penalty +=
        Math.abs(experiencedCount - targetExperiencedCount) *
        weights.interviewExperience;
    }
  }

  // 짝수 배치 필수 직렬: 1명만 있으면 무거운 페널티 (0명 또는 2명+ 필요)
  if (stats.pairRequiredSeries.length > 0) {
    for (const series of stats.pairRequiredSeries) {
      const count = group.members.filter((m) => m.series === series).length;
      if (count === 1) {
        penalty += SINGLETON_PENALTY;
      }
    }
  }

  return penalty;
}

function calcTotalPenalty(
  groups: StudyGroup[],
  weights: PenaltyWeights,
  stats: GlobalStats
): number {
  return groups.reduce(
    (sum, group) => sum + calcGroupPenalty(group, weights, stats),
    0
  );
}

export function calcSwapDelta(
  groupA: StudyGroup,
  memberAIndex: number,
  groupB: StudyGroup,
  memberBIndex: number,
  weights: PenaltyWeights,
  stats: GlobalStats
): number {
  const memberA = groupA.members[memberAIndex];
  const memberB = groupB.members[memberBIndex];
  const beforePenalty =
    calcGroupPenalty(groupA, weights, stats) + calcGroupPenalty(groupB, weights, stats);

  groupA.members[memberAIndex] = memberB;
  groupB.members[memberBIndex] = memberA;

  const afterPenalty =
    calcGroupPenalty(groupA, weights, stats) + calcGroupPenalty(groupB, weights, stats);

  groupA.members[memberAIndex] = memberA;
  groupB.members[memberBIndex] = memberB;

  return afterPenalty - beforePenalty;
}

export function optimizeBySwap(
  groups: StudyGroup[],
  lockedIds: Set<string>,
  weights: PenaltyWeights,
  stats: GlobalStats
): { iterations: number; swapsPerformed: number } {
  let iterations = 0;
  let swapsPerformed = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    iterations += 1;
    let improvedInIteration = false;

    for (let groupAIndex = 0; groupAIndex < groups.length - 1; groupAIndex += 1) {
      for (
        let groupBIndex = groupAIndex + 1;
        groupBIndex < groups.length;
        groupBIndex += 1
      ) {
        const groupA = groups[groupAIndex];
        const groupB = groups[groupBIndex];

        let improvedInPair = true;
        while (improvedInPair) {
          improvedInPair = false;
          let bestSwap:
            | {
                memberAIndex: number;
                memberBIndex: number;
                delta: number;
              }
            | null = null;

          for (
            let memberAIndex = 0;
            memberAIndex < groupA.members.length;
            memberAIndex += 1
          ) {
            const memberA = groupA.members[memberAIndex];
            if (lockedIds.has(memberA.id)) {
              continue;
            }

            for (
              let memberBIndex = 0;
              memberBIndex < groupB.members.length;
              memberBIndex += 1
            ) {
              const memberB = groupB.members[memberBIndex];
              if (lockedIds.has(memberB.id) || memberA.gender !== memberB.gender) {
                continue;
              }

              const delta = calcSwapDelta(
                groupA,
                memberAIndex,
                groupB,
                memberBIndex,
                weights,
                stats
              );

              if (delta < -EPSILON && (!bestSwap || delta < bestSwap.delta)) {
                bestSwap = {
                  memberAIndex,
                  memberBIndex,
                  delta,
                };
              }
            }
          }

          if (bestSwap) {
            const memberA = groupA.members[bestSwap.memberAIndex];
            const memberB = groupB.members[bestSwap.memberBIndex];
            groupA.members[bestSwap.memberAIndex] = memberB;
            groupB.members[bestSwap.memberBIndex] = memberA;
            swapsPerformed += 1;
            improvedInIteration = true;
            improvedInPair = true;
          }
        }
      }
    }

    if (!improvedInIteration) {
      break;
    }
  }

  return { iterations, swapsPerformed };
}

export function groupBySeries(members: Member[]): Map<string, Member[]> {
  const seriesMap = new Map<string, Member[]>();

  for (const member of members) {
    const key = member.series || '미분류';
    const list = seriesMap.get(key) || [];
    list.push(member);
    seriesMap.set(key, list);
  }

  return seriesMap;
}

export function interleaveBySeriesQueue(seriesMap: Map<string, Member[]>): Member[] {
  const seriesQueues = Array.from(seriesMap.values()).map((queue) => shuffle(queue));
  const result: Member[] = [];
  const maxLength = seriesQueues.reduce(
    (max, queue) => Math.max(max, queue.length),
    0
  );

  for (let queueIndex = 0; queueIndex < maxLength; queueIndex += 1) {
    for (const index of shuffle(seriesQueues.map((_, idx) => idx))) {
      if (queueIndex < seriesQueues[index].length) {
        result.push(seriesQueues[index][queueIndex]);
      }
    }
  }

  return result;
}

function countGender(group: StudyGroup, gender: Member['gender']): number {
  return group.members.filter((member) => member.gender === gender).length;
}

function buildTargetGroupSizes(
  groups: StudyGroup[],
  totalMembers: number,
  maxSize: number
): number[] {
  const targets = groups.map((group) => group.members.length);
  let remainingSlots = totalMembers - targets.reduce((sum, size) => sum + size, 0);

  while (remainingSlots > 0) {
    const candidateIndexes = groups
      .map((_, index) => index)
      .filter((index) => targets[index] < maxSize);

    if (candidateIndexes.length === 0) {
      break;
    }

    const minSize = candidateIndexes.reduce(
      (min, index) => Math.min(min, targets[index]),
      Number.POSITIVE_INFINITY
    );

    for (const index of shuffle(candidateIndexes.filter((idx) => targets[idx] === minSize))) {
      if (remainingSlots === 0) {
        break;
      }

      targets[index] += 1;
      remainingSlots -= 1;
    }
  }

  return targets;
}

function buildTargetGenderCounts(
  groups: StudyGroup[],
  targetGroupSizes: number[],
  gender: Member['gender'],
  totalGenderCount: number,
  targetGenderRatio: number
): number[] {
  const targets = groups.map((group) => countGender(group, gender));
  let remainingGenderCount = totalGenderCount - targets.reduce((sum, count) => sum + count, 0);
  const idealCounts = targetGroupSizes.map((size) => size * targetGenderRatio);

  while (remainingGenderCount > 0) {
    const candidateIndexes = groups
      .map((_, index) => index)
      .filter((index) => targets[index] < targetGroupSizes[index]);

    if (candidateIndexes.length === 0) {
      break;
    }

    let bestIndex = candidateIndexes[0];
    let bestDeficit = idealCounts[bestIndex] - targets[bestIndex];

    for (const index of candidateIndexes.slice(1)) {
      const deficit = idealCounts[index] - targets[index];
      if (
        deficit > bestDeficit + EPSILON ||
        (Math.abs(deficit - bestDeficit) <= EPSILON &&
          targetGroupSizes[index] - targets[index] >
            targetGroupSizes[bestIndex] - targets[bestIndex])
      ) {
        bestIndex = index;
        bestDeficit = deficit;
      }
    }

    targets[bestIndex] += 1;
    remainingGenderCount -= 1;
  }

  return targets;
}

function pickTargetGroupIndex(
  candidateIndexes: number[],
  groups: StudyGroup[],
  gender: Member['gender'],
  targetGenderCounts: number[],
  cursor: number
): number {
  if (candidateIndexes.length === 0) {
    return -1;
  }

  return [...candidateIndexes].sort((a, b) => {
    const deficitA = targetGenderCounts[a] - countGender(groups[a], gender);
    const deficitB = targetGenderCounts[b] - countGender(groups[b], gender);
    if (Math.abs(deficitA - deficitB) > EPSILON) {
      return deficitB - deficitA;
    }

    const sizeDiff = groups[a].members.length - groups[b].members.length;
    if (sizeDiff !== 0) {
      return sizeDiff;
    }

    const cursorDistanceA = (a - cursor + groups.length) % groups.length;
    const cursorDistanceB = (b - cursor + groups.length) % groups.length;
    return cursorDistanceA - cursorDistanceB;
  })[0];
}

export function distributeToGroups(
  queue: Member[],
  groups: StudyGroup[],
  maxSize: number,
  gender: Member['gender'],
  targetGenderCounts: number[]
): void {
  let cursor = 0;

  for (const member of queue) {
    const preferredIndexes = groups
      .map((group, index) => ({ group, index }))
      .filter(
        ({ group, index }) =>
          group.members.length < maxSize &&
          countGender(group, gender) < targetGenderCounts[index]
      )
      .map(({ index }) => index);

    let targetIndex = pickTargetGroupIndex(
      preferredIndexes,
      groups,
      gender,
      targetGenderCounts,
      cursor
    );

    if (targetIndex === -1) {
      const fallbackIndexes = groups
        .map((group, index) => ({ group, index }))
        .filter(({ group }) => group.members.length < maxSize)
        .map(({ index }) => index);

      targetIndex = pickTargetGroupIndex(
        fallbackIndexes,
        groups,
        gender,
        targetGenderCounts,
        cursor
      );

      if (targetIndex === -1) {
        const smallestGroup = groups.reduce((minGroup, group) =>
          group.members.length < minGroup.members.length ? group : minGroup
        );
        targetIndex = groups.findIndex(
          (group) => group.groupNumber === smallestGroup.groupNumber
        );
      } else {
        cursor = (targetIndex + 1) % groups.length;
      }
    }

    groups[targetIndex].members.push(member);
    cursor = (targetIndex + 1) % groups.length;
  }
}

function getTotalGroups(members: Member[], settings: GroupSettings): number {
  const bySize = Math.max(1, Math.ceil(members.length / settings.groupSize.max));
  const maxPreAssignedGroup = settings.usePreAssignment
    ? members.reduce(
        (max, member) =>
          Math.max(
            max,
            member.preAssignedGroup && member.preAssignedGroup > 0
              ? member.preAssignedGroup
              : 0
          ),
        0
      )
    : 0;

  return Math.max(bySize, maxPreAssignedGroup);
}

export function applyHardConstraints(
  members: Member[],
  settings: GroupSettings,
  totalGroups: number
): HardConstraintResult {
  const groups: StudyGroup[] = Array.from({ length: totalGroups }, (_, index) => ({
    groupNumber: index + 1,
    members: [],
  }));
  const warnings: string[] = [];
  const assignedIds = new Set<string>();
  const lockedIds = new Set<string>();

  if (settings.usePreAssignment) {
    for (const member of members) {
      if (member.preAssignedGroup === undefined) {
        continue;
      }

      if (member.preAssignedGroup < 1) {
        warnings.push(
          `사전 편성 조 번호가 잘못된 멤버 '${member.name}'은 자동 배정 대상으로 처리합니다.`
        );
        continue;
      }

      const groupIndex = member.preAssignedGroup - 1;
      if (groupIndex >= groups.length) {
        continue;
      }

      groups[groupIndex].members.push(member);
      assignedIds.add(member.id);
      lockedIds.add(member.id);
    }
  }

  for (const rule of settings.forceAssignRules) {
    const candidates = shuffle(
      members.filter(
        (member) => member.series === rule.series && !assignedIds.has(member.id)
      )
    );

    // 사전 편성으로 이미 배치된 같은 직렬 인원을 고려하여 부족분만 추가
    let totalNeeded = 0;
    for (const group of groups) {
      const alreadyInGroup = group.members.filter(
        (m) => m.series === rule.series
      ).length;
      totalNeeded += Math.max(0, rule.countPerGroup - alreadyInGroup);
    }

    if (candidates.length < totalNeeded) {
      warnings.push(
        `'${rule.series}' 직렬 인원(${candidates.length}명)이 부족하여 모든 조에 ${rule.countPerGroup}명씩 배정하지 못했습니다. 가능한 범위까지만 고정 배정합니다.`
      );
    }

    let candidateIndex = 0;
    for (const group of groups) {
      const alreadyInGroup = group.members.filter(
        (m) => m.series === rule.series
      ).length;
      const needed = Math.max(0, rule.countPerGroup - alreadyInGroup);

      for (
        let count = 0;
        count < needed && candidateIndex < candidates.length;
        count += 1
      ) {
        const member = candidates[candidateIndex];
        group.members.push(member);
        assignedIds.add(member.id);
        lockedIds.add(member.id);
        candidateIndex += 1;
      }
    }
  }

  return { groups, assignedIds, lockedIds, warnings };
}

function createInitialAssignment(
  groups: StudyGroup[],
  members: Member[],
  settings: GroupSettings,
  assignedIds: Set<string>
): void {
  const remainingMembers = members.filter((member) => !assignedIds.has(member.id));
  const maleMembers = shuffle(
    remainingMembers.filter((member) => member.gender === 'male')
  );
  const femaleMembers = shuffle(
    remainingMembers.filter((member) => member.gender === 'female')
  );
  const targetFemaleRatio = getTargetFemaleRatio(members, settings);
  const targetGroupSizes = buildTargetGroupSizes(groups, members.length, settings.groupSize.max);
  const targetFemaleCounts = buildTargetGenderCounts(
    groups,
    targetGroupSizes,
    'female',
    members.filter((member) => member.gender === 'female').length,
    targetFemaleRatio
  );
  const targetMaleCounts = targetGroupSizes.map((size, index) =>
    Math.max(0, size - targetFemaleCounts[index])
  );
  const maleQueue = interleaveBySeriesQueue(groupBySeries(maleMembers));
  const femaleQueue = interleaveBySeriesQueue(groupBySeries(femaleMembers));

  const assignmentOrder =
    femaleQueue.length <= maleQueue.length
      ? [
          { queue: femaleQueue, gender: 'female' as const, targets: targetFemaleCounts },
          { queue: maleQueue, gender: 'male' as const, targets: targetMaleCounts },
        ]
      : [
          { queue: maleQueue, gender: 'male' as const, targets: targetMaleCounts },
          { queue: femaleQueue, gender: 'female' as const, targets: targetFemaleCounts },
        ];

  for (const { queue, gender, targets } of assignmentOrder) {
    distributeToGroups(queue, groups, settings.groupSize.max, gender, targets);
  }
}

function buildMetrics(
  groups: StudyGroup[],
  weights: PenaltyWeights,
  stats: GlobalStats,
  iterations: number,
  swapsPerformed: number
): OptimizationMetrics {
  const penaltyBreakdown = createEmptyWeights();

  (Object.keys(penaltyBreakdown) as (keyof PenaltyWeights)[]).forEach((key) => {
    const oneWeight = createEmptyWeights();
    oneWeight[key] = weights[key];
    penaltyBreakdown[key] = calcTotalPenalty(groups, oneWeight, stats);
  });

  return {
    totalPenalty: calcTotalPenalty(groups, weights, stats),
    iterations,
    swapsPerformed,
    penaltyBreakdown,
  };
}

export function assignGroups(
  members: Member[],
  settings: GroupSettings
): AssignmentResult {
  if (members.length === 0) {
    return {
      groups: [],
      warnings: ['목록이 비어 있습니다.'],
      lockedMemberIds: [],
      metrics: {
        totalPenalty: 0,
        iterations: 0,
        swapsPerformed: 0,
        penaltyBreakdown: createEmptyWeights(),
      },
    };
  }

  const { normalized, warnings: normalizationWarnings } = getNormalizedSettings(settings);
  const totalGroups = getTotalGroups(members, normalized);
  const hardConstraintResult = applyHardConstraints(members, normalized, totalGroups);

  createInitialAssignment(
    hardConstraintResult.groups,
    members,
    normalized,
    hardConstraintResult.assignedIds
  );

  const stats = computeGlobalStats(members, totalGroups, normalized);
  const hasActivePenalty = Object.values(normalized.penaltyWeights).some(
    (weight) => weight > 0
  );
  const optimizationResult =
    hasActivePenalty && hardConstraintResult.groups.length > 1
      ? optimizeBySwap(
          hardConstraintResult.groups,
          hardConstraintResult.lockedIds,
          normalized.penaltyWeights,
          stats
        )
      : { iterations: 0, swapsPerformed: 0 };

  const warnings = [...normalizationWarnings, ...hardConstraintResult.warnings];

  for (const group of hardConstraintResult.groups) {
    if (group.members.length < normalized.groupSize.min) {
      warnings.push(
        `${group.groupNumber}조 인원(${group.members.length}명)이 최소 인원(${normalized.groupSize.min}명)보다 적습니다.`
      );
    }
    if (group.members.length > normalized.groupSize.max) {
      warnings.push(
        `${group.groupNumber}조 인원(${group.members.length}명)이 최대 인원(${normalized.groupSize.max}명)을 초과했습니다.`
      );
    }
  }

  const metrics = buildMetrics(
    hardConstraintResult.groups,
    normalized.penaltyWeights,
    stats,
    optimizationResult.iterations,
    optimizationResult.swapsPerformed
  );

  return {
    groups: hardConstraintResult.groups,
    warnings,
    metrics,
    lockedMemberIds: Array.from(hardConstraintResult.lockedIds),
  };
}
