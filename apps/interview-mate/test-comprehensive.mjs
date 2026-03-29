// 종합 테스트: 알고리즘 + 텍스트 파싱 + 엣지케이스
// algorithm.ts와 excel.ts(parseTextInput)의 순수 로직을 재현하여 테스트

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${label}`);
  }
}

// ===== 알고리즘 코드 복사 (algorithm.ts 로직) =====

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
  for (const m of members) {
    const list = map.get(m.series) || [];
    list.push(m);
    map.set(m.series, list);
  }
  return map;
}

function interleaveBySeriesQueue(seriesMap) {
  const queues = Array.from(seriesMap.values());
  const result = [];
  let maxLen = 0;
  for (const q of queues) { if (q.length > maxLen) maxLen = q.length; }
  for (let i = 0; i < maxLen; i++) {
    const order = shuffle(queues.map((_, idx) => idx));
    for (const idx of order) { if (i < queues[idx].length) result.push(queues[idx][i]); }
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
      const genderCount = group.members.filter(m => m.gender === gender).length;
      const genderFull = genderLimitPerGroup !== null && genderCount >= genderLimitPerGroup;
      if (!groupFull && !genderFull) break;
      groupIdx = (groupIdx + 1) % groups.length;
      attempts++;
    }
    if (attempts < groups.length) {
      groups[groupIdx].members.push(member);
      groupIdx = (groupIdx + 1) % groups.length;
    } else {
      const smallest = groups.reduce((min, g) => g.members.length < min.members.length ? g : min);
      if (smallest.members.length < maxSize) smallest.members.push(member);
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
      const genderCount = group.members.filter(m => m.gender === gender).length;
      const genderFull = genderLimitPerGroup !== null && genderCount >= genderLimitPerGroup;
      if (!groupFull && !genderFull) break;
      groupIdx += direction;
      if (groupIdx >= groups.length) { groupIdx = groups.length - 1; direction = -1; }
      else if (groupIdx < 0) { groupIdx = 0; direction = 1; }
      attempts++;
    }
    if (attempts < groups.length) {
      groups[groupIdx].members.push(member);
    } else {
      const smallest = groups.reduce((min, g) => g.members.length < min.members.length ? g : min);
      if (smallest.members.length < maxSize) smallest.members.push(member);
    }
    groupIdx += direction;
    if (groupIdx >= groups.length) { groupIdx = groups.length - 1; direction = -1; }
    else if (groupIdx < 0) { groupIdx = 0; direction = 1; }
  }
}

function assignGroups(members, settings) {
  const warnings = [];
  const { groupSize, genderRatio, forceAssignRules, usePreAssignment, useScoreBalance } = settings;

  if (members.length === 0) return { groups: [], warnings: ['명단이 비어 있습니다.'] };

  const preAssignedMembers = usePreAssignment
    ? members.filter(m => m.preAssignedGroup !== undefined) : [];
  const maxPreAssignedGroup = preAssignedMembers.reduce(
    (max, m) => Math.max(max, m.preAssignedGroup), 0);

  const totalGroupsBySize = Math.max(1, Math.ceil(members.length / groupSize.max));
  const totalGroups = Math.max(totalGroupsBySize, maxPreAssignedGroup);

  const groups = Array.from({ length: totalGroups }, (_, i) => ({ groupNumber: i + 1, members: [] }));
  const assignedIds = new Set();

  for (const member of preAssignedMembers) {
    const groupIdx = member.preAssignedGroup - 1;
    if (groupIdx >= 0 && groupIdx < groups.length) {
      groups[groupIdx].members.push(member);
      assignedIds.add(member.id);
    }
  }

  for (const rule of forceAssignRules) {
    const targetMembers = members.filter(m => m.series === rule.series && !assignedIds.has(m.id));
    if (targetMembers.length < rule.countPerGroup * totalGroups) {
      warnings.push(`'${rule.series}' 부족`);
    }
    const shuffled = shuffle(targetMembers);
    let idx = 0;
    for (const group of groups) {
      let assigned = 0;
      while (assigned < rule.countPerGroup && idx < shuffled.length) {
        group.members.push(shuffled[idx]);
        assignedIds.add(shuffled[idx].id);
        idx++; assigned++;
      }
    }
  }

  const remainingMembers = members.filter(m => !assignedIds.has(m.id));
  const males = shuffle(remainingMembers.filter(m => m.gender === 'male'));
  const females = shuffle(remainingMembers.filter(m => m.gender === 'female'));

  let malesPerGroup = null;
  let femalesPerGroup = null;
  if (genderRatio.mode === 'manual' && genderRatio.maleRatio !== undefined && genderRatio.femaleRatio !== undefined) {
    const ratioTotal = genderRatio.maleRatio + genderRatio.femaleRatio;
    malesPerGroup = Math.round((genderRatio.maleRatio / ratioTotal) * groupSize.max);
    femalesPerGroup = groupSize.max - malesPerGroup;
  }

  if (useScoreBalance) {
    const malesWithScore = males.filter(m => m.score !== undefined);
    const malesWithoutScore = males.filter(m => m.score === undefined);
    const femalesWithScore = females.filter(m => m.score !== undefined);
    const femalesWithoutScore = females.filter(m => m.score === undefined);
    malesWithScore.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    femalesWithScore.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    snakeDraftToGroups(malesWithScore, groups, groupSize.max, malesPerGroup, 'male');
    snakeDraftToGroups(femalesWithScore, groups, groupSize.max, femalesPerGroup, 'female');
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

  for (const group of groups) {
    if (group.members.length < groupSize.min)
      warnings.push(`${group.groupNumber}조 최소 미달`);
    if (group.members.length > groupSize.max)
      warnings.push(`${group.groupNumber}조 최대 초과`);
  }

  return { groups, warnings };
}

// ===== parseTextInput 로직 (excel.ts) =====

function parseGender(value) {
  const n = value.toLowerCase().trim();
  if (n === '여' || n === '여자' || n === '여성' || n === 'female' || n === 'f') return 'female';
  return 'male';
}
function parseScore(value) {
  if (!value) return undefined;
  const num = parseFloat(value);
  return isNaN(num) ? undefined : num;
}
function parseGroupNumber(value) {
  if (!value) return undefined;
  const cleaned = value.replace(/[조\s]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? undefined : num;
}
function findIndex(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase();
    for (const k of keywords) { if (h === k.toLowerCase()) return i; }
  }
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase();
    for (const k of keywords) { const kw = k.toLowerCase(); if (kw.length >= 3 && h.includes(kw)) return i; }
  }
  return -1;
}
function parseTextInput(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headerCells = lines[0].split(delimiter).map(h => h.trim());
  const nameIdx = findIndex(headerCells, ['이름', '성명', 'name']);
  const phoneIdx = findIndex(headerCells, ['연락처', '전화번호', '핸드폰', '휴대폰', 'phone', '전화']);
  const genderIdx = findIndex(headerCells, ['성별', 'gender']);
  const seriesIdx = findIndex(headerCells, ['직렬', '분야', 'series', '직군']);
  const regionIdx = findIndex(headerCells, ['지역', '시도', 'region', '응시지역']);
  const scoreIdx = findIndex(headerCells, ['성적', '점수', '필기성적', '필기점수', 'score']);
  const groupIdx = findIndex(headerCells, ['조', '편성조', 'group', '스터디조']);
  if (nameIdx === -1) throw new Error('이름 열 없음');
  const members = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map(c => c.trim());
    const name = cells[nameIdx] || '';
    if (!name) continue;
    members.push({
      id: `member-${i + 1}`,
      name,
      phone: phoneIdx >= 0 ? cells[phoneIdx] || '' : '',
      gender: parseGender(genderIdx >= 0 ? cells[genderIdx] || '' : ''),
      series: seriesIdx >= 0 ? cells[seriesIdx] || '' : '',
      region: regionIdx >= 0 ? cells[regionIdx] || '' : '',
      score: parseScore(scoreIdx >= 0 ? cells[scoreIdx] || '' : ''),
      preAssignedGroup: groupIdx >= 0 ? parseGroupNumber(cells[groupIdx] || '') : undefined,
    });
  }
  return members;
}

// ===== 헬퍼 =====

const seriesList = ['일반', '경채', '101경비단', '경행', '사이버'];
const regions = ['서울', '경기', '부산', '대구', '인천'];

function gen(count, opts = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m-${i + 1}`,
    name: `수험생${i + 1}`,
    phone: `010-0000-${String(i).padStart(4, '0')}`,
    gender: opts.allFemale ? 'female' : (opts.allMale ? 'male' : (Math.random() < 0.7 ? 'male' : 'female')),
    series: opts.series ?? seriesList[Math.floor(Math.random() * seriesList.length)],
    region: regions[Math.floor(Math.random() * regions.length)],
    score: opts.withScore ? Math.round((50 + Math.random() * 50) * 10) / 10 : undefined,
    preAssignedGroup: undefined,
  }));
}

const baseSettings = {
  examType: 'police',
  groupSize: { min: 8, max: 10 },
  genderRatio: { mode: 'auto' },
  forceAssignRules: [],
  usePreAssignment: true,
  useScoreBalance: false,
};

function totalAssigned(result) {
  return result.groups.reduce((s, g) => s + g.members.length, 0);
}
function allIds(result) {
  return result.groups.flatMap(g => g.members.map(m => m.id));
}
function noDuplicates(result) {
  const ids = allIds(result);
  return ids.length === new Set(ids).size;
}

// =============== 테스트 시작 ===============

console.log('\n======= 1. 빈 명단 =======');
{
  const r = assignGroups([], baseSettings);
  assert(r.groups.length === 0, '조 0개');
  assert(r.warnings.length > 0, '경고 메시지 있음');
}

console.log('\n======= 2. 소수 인원 (3명) =======');
{
  const m = gen(3);
  const r = assignGroups(m, baseSettings);
  assert(r.groups.length === 1, '조 1개');
  assert(totalAssigned(r) === 3, '3명 배정');
  assert(noDuplicates(r), '중복 없음');
  assert(r.warnings.some(w => w.includes('최소')), '최소 인원 미달 경고');
}

console.log('\n======= 3. 정확히 10명 (1조) =======');
{
  const m = gen(10);
  const r = assignGroups(m, baseSettings);
  assert(r.groups.length === 1, '조 1개');
  assert(totalAssigned(r) === 10, '10명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 4. 50명 기본 배정 =======');
{
  const m = gen(50);
  const r = assignGroups(m, baseSettings);
  assert(r.groups.length === 5, '조 5개');
  assert(totalAssigned(r) === 50, '50명 배정');
  assert(noDuplicates(r), '중복 없음');
  // 인원 분배 균등 확인
  const sizes = r.groups.map(g => g.members.length);
  assert(Math.max(...sizes) - Math.min(...sizes) <= 2, '조별 인원 편차 2 이하');
}

console.log('\n======= 5. 100명 대규모 =======');
{
  const m = gen(100);
  const r = assignGroups(m, baseSettings);
  assert(r.groups.length === 10, '조 10개');
  assert(totalAssigned(r) === 100, '100명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 6. 11명 (2조 - max 10) =======');
{
  const m = gen(11);
  const r = assignGroups(m, baseSettings);
  assert(r.groups.length === 2, '조 2개');
  assert(totalAssigned(r) === 11, '11명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 7. 사전편성: 1조에 3명 고정 =======');
{
  const m = gen(30);
  m[0].preAssignedGroup = 1;
  m[1].preAssignedGroup = 1;
  m[2].preAssignedGroup = 1;
  const r = assignGroups(m, baseSettings);
  const g1 = r.groups[0];
  const preInG1 = g1.members.filter(x => x.preAssignedGroup === 1).length;
  assert(preInG1 === 3, '1조에 사전편성 3명 유지');
  assert(totalAssigned(r) === 30, '30명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 8. 사전편성 usePreAssignment=false =======');
{
  const m = gen(20);
  m[0].preAssignedGroup = 1;
  m[1].preAssignedGroup = 1;
  m[2].preAssignedGroup = 2;
  const r = assignGroups(m, { ...baseSettings, usePreAssignment: false });
  assert(totalAssigned(r) === 20, '20명 배정');
  assert(noDuplicates(r), '중복 없음');
  // 사전편성이 무시되므로 1조에 preAssigned=1 멤버가 반드시 있지 않을 수 있음
  assert(r.groups.length === 2, '조 2개');
}

console.log('\n======= 9. 사전편성 조번호가 큰 경우 (15조) =======');
{
  const m = gen(30);
  m[0].preAssignedGroup = 15;
  const r = assignGroups(m, baseSettings);
  assert(r.groups.length >= 15, '조 수 >= 15');
  const g15 = r.groups.find(g => g.groupNumber === 15);
  assert(g15 && g15.members.some(x => x.id === m[0].id), '15조에 해당 멤버 존재');
  assert(totalAssigned(r) === 30, '30명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 10. 강제배정 규칙 =======');
{
  const m = gen(50);
  for (let i = 0; i < 15; i++) m[i].series = '101경비단';
  const r = assignGroups(m, {
    ...baseSettings,
    forceAssignRules: [{ id: 'r1', series: '101경비단', countPerGroup: 2 }],
  });
  assert(totalAssigned(r) === 50, '50명 배정');
  assert(noDuplicates(r), '중복 없음');
  // 각 조에 101경비단이 최소 2명씩 있는지
  for (const g of r.groups) {
    const cnt = g.members.filter(x => x.series === '101경비단').length;
    assert(cnt >= 2, `${g.groupNumber}조: 101경비단 ${cnt}명 >= 2`);
  }
}

console.log('\n======= 11. 강제배정 인원 부족 =======');
{
  const m = gen(30, { series: '일반' }); // 전원 일반
  for (let i = 0; i < 3; i++) m[i].series = '사이버'; // 사이버 정확히 3명
  // 3조 × 2명 = 6명 필요, 사이버 3명뿐 → 부족 경고
  const r = assignGroups(m, {
    ...baseSettings,
    forceAssignRules: [{ id: 'r1', series: '사이버', countPerGroup: 2 }],
  });
  assert(r.warnings.some(w => w.includes('사이버') || w.includes('부족')), '부족 경고 표시');
  assert(totalAssigned(r) === 30, '30명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 12. 수동 성비 (7:3) =======');
{
  // 남 35, 여 15 = 50명
  const males = gen(35, { allMale: true });
  const females = gen(15, { allFemale: true });
  females.forEach((f, i) => { f.id = `f-${i + 1}`; f.name = `여성${i + 1}`; });
  const m = [...males, ...females];
  const r = assignGroups(m, {
    ...baseSettings,
    genderRatio: { mode: 'manual', maleRatio: 7, femaleRatio: 3 },
  });
  assert(totalAssigned(r) === 50, '50명 배정');
  assert(noDuplicates(r), '중복 없음');
  // 조별 남녀 확인
  for (const g of r.groups) {
    const mc = g.members.filter(x => x.gender === 'male').length;
    const fc = g.members.filter(x => x.gender === 'female').length;
    assert(mc <= 7 || fc === 0, `${g.groupNumber}조: 남 ${mc} <= 7 또는 여 없음`);
    assert(fc <= 3 || mc === 0, `${g.groupNumber}조: 여 ${fc} <= 3 또는 남 없음`);
  }
}

console.log('\n======= 13. 성적 균등 (스네이크 드래프트) =======');
{
  const m = gen(50, { withScore: true });
  const r = assignGroups(m, { ...baseSettings, useScoreBalance: true });
  assert(totalAssigned(r) === 50, '50명 배정');
  assert(noDuplicates(r), '중복 없음');
  const avgs = r.groups.map(g => {
    const scored = g.members.filter(x => x.score !== undefined);
    return scored.reduce((s, x) => s + x.score, 0) / scored.length;
  });
  const avgAll = avgs.reduce((s, a) => s + a, 0) / avgs.length;
  const maxDiff = Math.max(...avgs.map(a => Math.abs(a - avgAll)));
  assert(maxDiff < 5, `스네이크 조별 평균 편차 ${maxDiff.toFixed(1)} < 5점`);
}

console.log('\n======= 14. 성적 균등 OFF vs ON 비교 =======');
{
  const m = gen(50, { withScore: true });
  const rOff = assignGroups(m, { ...baseSettings, useScoreBalance: false });
  const rOn = assignGroups(m, { ...baseSettings, useScoreBalance: true });

  const calcMaxDiff = (result) => {
    const avgs = result.groups.map(g => {
      const scored = g.members.filter(x => x.score !== undefined);
      return scored.reduce((s, x) => s + x.score, 0) / scored.length;
    });
    const avg = avgs.reduce((s, a) => s + a, 0) / avgs.length;
    return Math.max(...avgs.map(a => Math.abs(a - avg)));
  };

  const diffOff = calcMaxDiff(rOff);
  const diffOn = calcMaxDiff(rOn);
  console.log(`  OFF 편차: ${diffOff.toFixed(1)}, ON 편차: ${diffOn.toFixed(1)}`);
  // ON이 OFF보다 같거나 나은 경우가 대부분 (랜덤이라 항상은 아님)
  assert(diffOn <= diffOff + 3, `스네이크가 비슷하거나 더 나음 (ON:${diffOn.toFixed(1)} vs OFF:${diffOff.toFixed(1)})`);
}

console.log('\n======= 15. 부분 성적 (50명 중 20명만) =======');
{
  const m = gen(50);
  for (let i = 0; i < 20; i++) m[i].score = Math.round((50 + Math.random() * 50) * 10) / 10;
  const r = assignGroups(m, { ...baseSettings, useScoreBalance: true });
  assert(totalAssigned(r) === 50, '50명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 16. 사전편성 + 강제배정 + 성적 균등 조합 =======');
{
  const m = gen(60, { withScore: true });
  m[0].preAssignedGroup = 1;
  m[1].preAssignedGroup = 1;
  m[2].preAssignedGroup = 2;
  for (let i = 10; i < 22; i++) m[i].series = '101경비단';
  const r = assignGroups(m, {
    ...baseSettings,
    useScoreBalance: true,
    forceAssignRules: [{ id: 'r1', series: '101경비단', countPerGroup: 2 }],
  });
  assert(totalAssigned(r) === 60, '60명 배정');
  assert(noDuplicates(r), '중복 없음');
  const g1pre = r.groups[0].members.filter(x => x.preAssignedGroup === 1).length;
  assert(g1pre === 2, `1조 사전편성 ${g1pre}/2명`);
}

console.log('\n======= 17. 전원 같은 성별 (남 only) =======');
{
  const m = gen(30, { allMale: true });
  const r = assignGroups(m, baseSettings);
  assert(totalAssigned(r) === 30, '30명 배정');
  assert(noDuplicates(r), '중복 없음');
  assert(r.groups.length === 3, '조 3개');
}

console.log('\n======= 18. 전원 같은 성별 + 수동 비율 =======');
{
  // 전원 남자에 7:3 수동 비율 → 여자 0명이므로 여자 제한 무관
  const m = gen(30, { allMale: true });
  const r = assignGroups(m, {
    ...baseSettings,
    genderRatio: { mode: 'manual', maleRatio: 7, femaleRatio: 3 },
  });
  assert(totalAssigned(r) === 30, '30명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 19. 전원 같은 직렬 =======');
{
  const m = gen(30, { series: '일반' });
  const r = assignGroups(m, baseSettings);
  assert(totalAssigned(r) === 30, '30명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 20. 사전편성 멤버가 강제배정 직렬인 경우 =======');
{
  const m = gen(30);
  m[0].series = '101경비단';
  m[0].preAssignedGroup = 2;
  m[1].series = '101경비단';
  m[1].preAssignedGroup = 2;
  for (let i = 10; i < 20; i++) m[i].series = '101경비단';
  const r = assignGroups(m, {
    ...baseSettings,
    forceAssignRules: [{ id: 'r1', series: '101경비단', countPerGroup: 1 }],
  });
  assert(totalAssigned(r) === 30, '30명 배정');
  assert(noDuplicates(r), '중복 없음');
  // m[0]과 m[1]은 사전편성으로 2조에 이미 배정됨 → 강제배정에서 제외
  const g2 = r.groups[1]; // 2조
  assert(g2.members.some(x => x.id === m[0].id), '사전편성 멤버가 2조에 존재');
  assert(g2.members.some(x => x.id === m[1].id), '사전편성 멤버가 2조에 존재');
}

// ===== 텍스트 파싱 테스트 =====

console.log('\n======= 21. parseTextInput: 탭 구분 =======');
{
  const text = '이름\t연락처\t성별\t직렬\t지역\n홍길동\t010-1234-5678\t남\t일반\t서울\n김영희\t010-9876-5432\t여\t경행\t부산';
  const m = parseTextInput(text);
  assert(m.length === 2, '2명 파싱');
  assert(m[0].name === '홍길동', '이름 매칭');
  assert(m[0].gender === 'male', '성별 남');
  assert(m[1].gender === 'female', '성별 여');
  assert(m[0].series === '일반', '직렬 매칭');
}

console.log('\n======= 22. parseTextInput: 쉼표 구분 =======');
{
  const text = '이름,연락처,성별,직렬,지역,필기성적,조\n홍길동,010-1234-5678,남,일반,서울,85.5,\n김영희,010-9876-5432,여,101경비단,경기,,1';
  const m = parseTextInput(text);
  assert(m.length === 2, '2명 파싱');
  assert(m[0].score === 85.5, '성적 85.5 파싱');
  assert(m[0].preAssignedGroup === undefined, '조 비어있으면 undefined');
  assert(m[1].score === undefined, '성적 없으면 undefined');
  assert(m[1].preAssignedGroup === 1, '조 1 파싱');
}

console.log('\n======= 23. parseTextInput: 빈 행 건너뛰기 =======');
{
  const text = '이름,성별\n홍길동,남\n\n김영희,여\n  \n이순신,남';
  const m = parseTextInput(text);
  assert(m.length === 3, '빈 행 무시하고 3명 파싱');
}

console.log('\n======= 24. parseTextInput: 헤더만 =======');
{
  const text = '이름,성별';
  const m = parseTextInput(text);
  assert(m.length === 0, '데이터 없으면 0명');
}

console.log('\n======= 25. parseTextInput: 이름 없는 행 =======');
{
  const text = '이름,성별\n,남\n홍길동,남';
  const m = parseTextInput(text);
  assert(m.length === 1, '이름 없는 행 건너뛰고 1명');
}

console.log('\n======= 26. parseGender 다양한 입력 =======');
{
  assert(parseGender('남') === 'male', '남 → male');
  assert(parseGender('남자') === 'male', '남자 → male');
  assert(parseGender('male') === 'male', 'male → male');
  assert(parseGender('M') === 'male', 'M → male');
  assert(parseGender('여') === 'female', '여 → female');
  assert(parseGender('여자') === 'female', '여자 → female');
  assert(parseGender('female') === 'female', 'female → female');
  assert(parseGender('F') === 'female', 'F → female');
  assert(parseGender('') === 'male', '빈 값 → male (기본)');
}

console.log('\n======= 27. parseGroupNumber 다양한 입력 =======');
{
  assert(parseGroupNumber('1') === 1, '1 → 1');
  assert(parseGroupNumber('1조') === 1, '1조 → 1');
  assert(parseGroupNumber('12') === 12, '12 → 12');
  assert(parseGroupNumber('') === undefined, '빈 값 → undefined');
  assert(parseGroupNumber('abc') === undefined, '비숫자 → undefined');
}

console.log('\n======= 28. parseScore 다양한 입력 =======');
{
  assert(parseScore('85.5') === 85.5, '85.5 → 85.5');
  assert(parseScore('100') === 100, '100 → 100');
  assert(parseScore('') === undefined, '빈 값 → undefined');
  assert(parseScore('abc') === undefined, '비숫자 → undefined');
  assert(parseScore('0') === 0, '0 → 0');
}

console.log('\n======= 29. 대규모 (200명) 누락/중복 + 조합 =======');
{
  const m = gen(200, { withScore: true });
  for (let i = 0; i < 10; i++) m[i].preAssignedGroup = Math.ceil(Math.random() * 5);
  for (let i = 50; i < 80; i++) m[i].series = '101경비단';
  const r = assignGroups(m, {
    ...baseSettings,
    useScoreBalance: true,
    forceAssignRules: [{ id: 'r1', series: '101경비단', countPerGroup: 1 }],
  });
  assert(totalAssigned(r) === 200, '200명 배정');
  assert(noDuplicates(r), '중복 없음');
}

console.log('\n======= 30. 1명 =======');
{
  const m = gen(1);
  const r = assignGroups(m, baseSettings);
  assert(r.groups.length === 1, '조 1개');
  assert(totalAssigned(r) === 1, '1명 배정');
  assert(noDuplicates(r), '중복 없음');
}

// ===== 결과 =====
console.log('\n' + '='.repeat(50));
console.log(`결과: ${passed} 통과 / ${failed} 실패 (총 ${passed + failed}개)`);
if (failed > 0) {
  console.log('실패한 테스트가 있습니다!');
  process.exit(1);
} else {
  console.log('모든 테스트 통과!');
}
