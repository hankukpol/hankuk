// 알고리즘 기본 동작 확인용 스모크 테스트 스크립트

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

function assignGroups(members, settings) {
  const warnings = [];
  const { groupSize, genderRatio, forceAssignRules } = settings;

  if (members.length === 0) {
    return { groups: [], warnings: ['명단이 비어 있습니다.'] };
  }

  const totalGroups = Math.max(1, Math.ceil(members.length / groupSize.max));
  const groups = Array.from({ length: totalGroups }, (_, i) => ({
    groupNumber: i + 1,
    members: [],
  }));
  const assignedIds = new Set();

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

  const maleQueue = interleaveBySeriesQueue(groupBySeries(males));
  const femaleQueue = interleaveBySeriesQueue(groupBySeries(females));

  distributeToGroups(maleQueue, groups, groupSize.max, malesPerGroup, 'male');
  distributeToGroups(femaleQueue, groups, groupSize.max, femalesPerGroup, 'female');

  for (const group of groups) {
    if (group.members.length < groupSize.min) {
      warnings.push(
        `${group.groupNumber}조 인원(${group.members.length}명)이 최소 인원보다 적습니다.`
      );
    }
    if (group.members.length > groupSize.max) {
      warnings.push(
        `${group.groupNumber}조 인원(${group.members.length}명)이 최대 인원을 초과했습니다.`
      );
    }
  }

  return { groups, warnings };
}

const policeSeries = ['일반', '경채', '101경비단', '경행', '사이버'];
const regions = ['서울', '경기', '부산', '대구', '인천'];

function gen(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m-${i + 1}`,
    name: `수험생${i + 1}`,
    phone: `010-0000-${String(i).padStart(4, '0')}`,
    gender: Math.random() < 0.7 ? 'male' : 'female',
    series: policeSeries[Math.floor(Math.random() * policeSeries.length)],
    region: regions[Math.floor(Math.random() * regions.length)],
  }));
}

function printResult(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`조 수: ${result.groups.length}`);

  for (const group of result.groups) {
    const maleCount = group.members.filter((member) => member.gender === 'male').length;
    const femaleCount = group.members.length - maleCount;
    const series = {};
    for (const member of group.members) {
      const key = member.series || '미분류';
      series[key] = (series[key] || 0) + 1;
    }

    const seriesSummary = Object.entries(series)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');

    console.log(
      `  ${group.groupNumber}조 ${group.members.length}명 (남 ${maleCount} / 여 ${femaleCount}) [${seriesSummary}]`
    );
  }

  if (result.warnings.length > 0) {
    console.log('경고:');
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

const baseSettings = {
  examType: 'police',
  groupSize: { min: 8, max: 10 },
  genderRatio: { mode: 'auto' },
  forceAssignRules: [],
};

printResult('기본 50명', assignGroups(gen(50), baseSettings));
printResult('소규모 10명', assignGroups(gen(10), baseSettings));
printResult('대규모 100명', assignGroups(gen(100), baseSettings));

const forcedMembers = gen(50);
for (let i = 0; i < 15; i++) {
  forcedMembers[i].series = '101경비단';
}
printResult(
  '강제 배정 101경비단 2명',
  assignGroups(forcedMembers, {
    ...baseSettings,
    forceAssignRules: [{ id: 'rule-1', series: '101경비단', countPerGroup: 2 }],
  })
);

printResult(
  '수동 성비 7:3',
  assignGroups(gen(50), {
    ...baseSettings,
    genderRatio: { mode: 'manual', maleRatio: 7, femaleRatio: 3 },
  })
);

printResult('빈 명단', assignGroups([], baseSettings));
printResult('극소규모 3명', assignGroups(gen(3), baseSettings));

console.log('\n=== 누락/중복 검증 ===');
const allMembers = gen(87);
const result = assignGroups(allMembers, baseSettings);
const totalAssigned = result.groups.reduce((sum, group) => sum + group.members.length, 0);
const assignedIds = result.groups.flatMap((group) => group.members.map((member) => member.id));

console.log(`입력 인원: ${allMembers.length}명`);
console.log(`배정 인원: ${totalAssigned}명`);
console.log(`누락 검사: ${allMembers.length === totalAssigned ? '통과' : '실패'}`);
console.log(
  `중복 검사: ${assignedIds.length === new Set(assignedIds).size ? '통과' : '실패'}`
);
