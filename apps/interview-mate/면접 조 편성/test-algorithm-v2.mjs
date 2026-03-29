// 알고리즘 v2 검증 스크립트
// 사전 편성, 성적 균등 분배, 강제 배정 조합을 확인한다.

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function groupBySeries(members) {
  const map = new Map();
  for (const member of members) {
    const list = map.get(member.series) || [];
    list.push(member);
    map.set(member.series, list);
  }
  return map;
}

function interleaveBySeriesQueue(seriesMap) {
  const queues = Array.from(seriesMap.values());
  const result = [];
  let maxLength = 0;

  for (const queue of queues) {
    if (queue.length > maxLength) maxLength = queue.length;
  }

  for (let i = 0; i < maxLength; i++) {
    for (const queue of queues) {
      if (i < queue.length) {
        result.push(queue[i]);
      }
    }
  }

  return result;
}

function distributeToGroups(queue, groups, maxSize, genderLimitPerGroup, gender) {
  let groupIdx = 0;

  for (const member of queue) {
    let attempts = 0;
    while (attempts < groups.length) {
      const group = groups[groupIdx];
      const groupFull = group.members.length >= maxSize;
      const genderCount = group.members.filter((m) => m.gender === gender).length;
      const genderFull =
        genderLimitPerGroup !== null && genderCount >= genderLimitPerGroup;

      if (!groupFull && !genderFull) break;

      groupIdx = (groupIdx + 1) % groups.length;
      attempts++;
    }

    if (attempts < groups.length) {
      groups[groupIdx].members.push(member);
      groupIdx = (groupIdx + 1) % groups.length;
    }
  }
}

function snakeDraftToGroups(sortedMembers, groups, maxSize, genderLimitPerGroup, gender) {
  let groupIdx = 0;
  let direction = 1;

  for (const member of sortedMembers) {
    let attempts = 0;
    while (attempts < groups.length) {
      const group = groups[groupIdx];
      const groupFull = group.members.length >= maxSize;
      const genderCount = group.members.filter((m) => m.gender === gender).length;
      const genderFull =
        genderLimitPerGroup !== null && genderCount >= genderLimitPerGroup;

      if (!groupFull && !genderFull) break;

      groupIdx += direction;
      if (groupIdx >= groups.length) {
        groupIdx = groups.length - 1;
        direction = -1;
      } else if (groupIdx < 0) {
        groupIdx = 0;
        direction = 1;
      }
      attempts++;
    }

    if (attempts < groups.length) {
      groups[groupIdx].members.push(member);
    }

    groupIdx += direction;
    if (groupIdx >= groups.length) {
      groupIdx = groups.length - 1;
      direction = -1;
    } else if (groupIdx < 0) {
      groupIdx = 0;
      direction = 1;
    }
  }
}

function assignGroups(members, settings) {
  const warnings = [];
  const {
    groupSize,
    genderRatio,
    forceAssignRules,
    usePreAssignment,
    useScoreBalance,
  } = settings;

  if (members.length === 0) {
    return { groups: [], warnings: ['명단이 비어 있습니다.'] };
  }

  const preAssignedMembers = usePreAssignment
    ? members.filter((member) => member.preAssignedGroup !== undefined)
    : [];
  const maxPreAssignedGroup = preAssignedMembers.reduce(
    (max, member) => Math.max(max, member.preAssignedGroup),
    0
  );

  const totalGroupsBySize = Math.max(1, Math.ceil(members.length / groupSize.max));
  const totalGroups = Math.max(totalGroupsBySize, maxPreAssignedGroup);

  const groups = Array.from({ length: totalGroups }, (_, i) => ({
    groupNumber: i + 1,
    members: [],
  }));
  const assignedIds = new Set();

  for (const member of preAssignedMembers) {
    const groupIdx = member.preAssignedGroup - 1;
    if (groupIdx >= 0 && groupIdx < groups.length) {
      groups[groupIdx].members.push(member);
      assignedIds.add(member.id);
    }
  }

  for (const rule of forceAssignRules) {
    const targetMembers = members.filter(
      (member) => member.series === rule.series && !assignedIds.has(member.id)
    );

    if (targetMembers.length < rule.countPerGroup * totalGroups) {
      warnings.push(
        `'${rule.series}' 직렬 인원이 부족하여 모든 조에 ${rule.countPerGroup}명씩 배정할 수 없습니다.`
      );
    }

    const shuffled = shuffle(targetMembers);
    let idx = 0;
    for (const group of groups) {
      let assigned = 0;
      while (assigned < rule.countPerGroup && idx < shuffled.length) {
        group.members.push(shuffled[idx]);
        assignedIds.add(shuffled[idx].id);
        idx++;
        assigned++;
      }
    }
  }

  const remainingMembers = members.filter((member) => !assignedIds.has(member.id));
  const males = shuffle(remainingMembers.filter((member) => member.gender === 'male'));
  const females = shuffle(
    remainingMembers.filter((member) => member.gender === 'female')
  );

  let malesPerGroup = null;
  let femalesPerGroup = null;
  if (
    genderRatio.mode === 'manual' &&
    genderRatio.maleRatio !== undefined &&
    genderRatio.femaleRatio !== undefined
  ) {
    const ratioTotal = genderRatio.maleRatio + genderRatio.femaleRatio;
    malesPerGroup = Math.round((genderRatio.maleRatio / ratioTotal) * groupSize.max);
    femalesPerGroup = groupSize.max - malesPerGroup;
  }

  if (useScoreBalance) {
    const malesWithScore = males.filter((member) => member.score !== undefined);
    const malesWithoutScore = males.filter((member) => member.score === undefined);
    const femalesWithScore = females.filter((member) => member.score !== undefined);
    const femalesWithoutScore = females.filter((member) => member.score === undefined);

    malesWithScore.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    femalesWithScore.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    snakeDraftToGroups(malesWithScore, groups, groupSize.max, malesPerGroup, 'male');
    snakeDraftToGroups(
      femalesWithScore,
      groups,
      groupSize.max,
      femalesPerGroup,
      'female'
    );

    const maleQueue = interleaveBySeriesQueue(groupBySeries(malesWithoutScore));
    const femaleQueue = interleaveBySeriesQueue(groupBySeries(femalesWithoutScore));
    distributeToGroups(maleQueue, groups, groupSize.max, malesPerGroup, 'male');
    distributeToGroups(femaleQueue, groups, groupSize.max, femalesPerGroup, 'female');
  } else {
    const maleQueue = interleaveBySeriesQueue(groupBySeries(males));
    const femaleQueue = interleaveBySeriesQueue(groupBySeries(females));
    distributeToGroups(maleQueue, groups, groupSize.max, malesPerGroup, 'male');
    distributeToGroups(femaleQueue, groups, groupSize.max, femalesPerGroup, 'female');
  }

  return { groups, warnings };
}

const seriesList = ['일반', '경채', '101경비단', '경행', '사이버'];
const regions = ['서울', '경기', '부산', '대구', '인천'];

function gen(count, withScore = false) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m-${i + 1}`,
    name: `수험생${i + 1}`,
    phone: `010-0000-${String(i).padStart(4, '0')}`,
    gender: Math.random() < 0.7 ? 'male' : 'female',
    series: seriesList[Math.floor(Math.random() * seriesList.length)],
    region: regions[Math.floor(Math.random() * regions.length)],
    score: withScore ? Math.round((50 + Math.random() * 50) * 10) / 10 : undefined,
  }));
}

function printResult(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`조 수: ${result.groups.length}`);

  for (const group of result.groups) {
    const maleCount = group.members.filter((member) => member.gender === 'male').length;
    const femaleCount = group.members.length - maleCount;
    const preAssignedCount = group.members.filter(
      (member) => member.preAssignedGroup !== undefined
    ).length;
    const scoredMembers = group.members.filter((member) => member.score !== undefined);
    const avgScore =
      scoredMembers.length > 0
        ? (
            scoredMembers.reduce((sum, member) => sum + member.score, 0) /
            scoredMembers.length
          ).toFixed(1)
        : '-';

    console.log(
      `  ${group.groupNumber}조 ${group.members.length}명 (남 ${maleCount} / 여 ${femaleCount}) 고정:${preAssignedCount} 평균:${avgScore}`
    );
  }

  if (result.warnings.length > 0) {
    console.log('경고:');
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

const defaultSettings = {
  examType: 'police',
  groupSize: { min: 8, max: 10 },
  genderRatio: { mode: 'auto' },
  forceAssignRules: [],
  usePreAssignment: true,
  useScoreBalance: false,
};

console.log('\n' + '='.repeat(60));
console.log('테스트 1: 사전 편성 + 자동 배정 혼합');
console.log('='.repeat(60));
const members1 = gen(50);
for (let i = 0; i < 4; i++) members1[i].preAssignedGroup = 1;
for (let i = 4; i < 8; i++) members1[i].preAssignedGroup = 2;
const result1 = assignGroups(members1, defaultSettings);
printResult('사전 편성 혼합', result1);

console.log('\n' + '='.repeat(60));
console.log('테스트 2: 성적 균등 분배');
console.log('='.repeat(60));
const members2 = gen(50, true);
const result2 = assignGroups(members2, {
  ...defaultSettings,
  useScoreBalance: true,
});
printResult('성적 균등 분배', result2);

console.log('\n' + '='.repeat(60));
console.log('테스트 3: 사전 편성 + 성적 균등 + 강제 배정');
console.log('='.repeat(60));
const members3 = gen(50, true);
for (let i = 0; i < 3; i++) members3[i].preAssignedGroup = 1;
for (let i = 3; i < 6; i++) members3[i].preAssignedGroup = 2;
for (let i = 10; i < 20; i++) members3[i].series = '101경비단';
const result3 = assignGroups(members3, {
  ...defaultSettings,
  useScoreBalance: true,
  forceAssignRules: [{ id: 'rule-1', series: '101경비단', countPerGroup: 2 }],
});
printResult('복합 시나리오', result3);

console.log('\n' + '='.repeat(60));
console.log('테스트 4: 부분 성적 입력');
console.log('='.repeat(60));
const members4 = gen(30, false);
for (let i = 0; i < 15; i++) {
  members4[i].score = Math.round((50 + Math.random() * 50) * 10) / 10;
}
const result4 = assignGroups(members4, {
  ...defaultSettings,
  useScoreBalance: true,
});
printResult('부분 성적 입력', result4);

console.log('\n' + '='.repeat(60));
console.log('테스트 5: 사전 편성 무시');
console.log('='.repeat(60));
const members5 = gen(30);
for (let i = 0; i < 5; i++) members5[i].preAssignedGroup = 1;
const result5 = assignGroups(members5, {
  ...defaultSettings,
  usePreAssignment: false,
});
printResult('사전 편성 무시', result5);

console.log('\n=== 누락/중복 검증 ===');
const members6 = gen(87, true);
for (let i = 0; i < 5; i++) members6[i].preAssignedGroup = 1;
for (let i = 5; i < 10; i++) members6[i].preAssignedGroup = 3;
const result6 = assignGroups(members6, {
  ...defaultSettings,
  useScoreBalance: true,
});
const totalAssigned = result6.groups.reduce(
  (sum, group) => sum + group.members.length,
  0
);
const assignedIds = result6.groups.flatMap((group) =>
  group.members.map((member) => member.id)
);

console.log(`입력 인원: ${members6.length}명`);
console.log(`배정 인원: ${totalAssigned}명`);
console.log(`누락 검사: ${members6.length === totalAssigned ? '통과' : '실패'}`);
console.log(
  `중복 검사: ${assignedIds.length === new Set(assignedIds).size ? '통과' : '실패'}`
);
