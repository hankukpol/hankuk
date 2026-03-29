// =================================================================
// 전수 테스트: 기존 108개 외 모든 경우의 수를 목업 데이터로 검증
// =================================================================

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) { passed++; }
  else { failed++; failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

// ===== 알고리즘 + 파싱 로직 복사 =====

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
  for (const m of members) { const l = map.get(m.series) || []; l.push(m); map.set(m.series, l); }
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
      if (group.members.length < maxSize) {
        const gc = group.members.filter(m => m.gender === gender).length;
        if (genderLimitPerGroup === null || gc < genderLimitPerGroup) break;
      }
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
  let groupIdx = 0, direction = 1;
  for (const member of sortedMembers) {
    let attempts = 0;
    while (attempts < groups.length) {
      const group = groups[groupIdx];
      if (group.members.length < maxSize) {
        const gc = group.members.filter(m => m.gender === gender).length;
        if (genderLimitPerGroup === null || gc < genderLimitPerGroup) break;
      }
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
  if (members.length === 0) return { groups: [], warnings: ['빈 명단'] };

  const preAssignedMembers = usePreAssignment
    ? members.filter(m => m.preAssignedGroup !== undefined) : [];
  const maxPreGroup = preAssignedMembers.reduce((max, m) => Math.max(max, m.preAssignedGroup), 0);
  const totalGroupsBySize = Math.max(1, Math.ceil(members.length / groupSize.max));
  const totalGroups = Math.max(totalGroupsBySize, maxPreGroup);

  const groups = Array.from({ length: totalGroups }, (_, i) => ({ groupNumber: i + 1, members: [] }));
  const assignedIds = new Set();

  for (const m of preAssignedMembers) {
    const idx = m.preAssignedGroup - 1;
    if (idx >= 0 && idx < groups.length) { groups[idx].members.push(m); assignedIds.add(m.id); }
  }

  for (const rule of forceAssignRules) {
    const targets = members.filter(m => m.series === rule.series && !assignedIds.has(m.id));
    if (targets.length < rule.countPerGroup * totalGroups) warnings.push(`'${rule.series}' 부족`);
    const sh = shuffle(targets);
    let idx = 0;
    for (const g of groups) {
      let a = 0;
      while (a < rule.countPerGroup && idx < sh.length) {
        g.members.push(sh[idx]); assignedIds.add(sh[idx].id); idx++; a++;
      }
    }
  }

  const remaining = members.filter(m => !assignedIds.has(m.id));
  const males = shuffle(remaining.filter(m => m.gender === 'male'));
  const females = shuffle(remaining.filter(m => m.gender === 'female'));

  let malesPerGroup = null, femalesPerGroup = null;
  if (genderRatio.mode === 'manual' && genderRatio.maleRatio !== undefined && genderRatio.femaleRatio !== undefined) {
    const total = genderRatio.maleRatio + genderRatio.femaleRatio;
    malesPerGroup = Math.round((genderRatio.maleRatio / total) * groupSize.max);
    femalesPerGroup = groupSize.max - malesPerGroup;
  }

  if (useScoreBalance) {
    const ms = males.filter(m => m.score !== undefined);
    const mns = males.filter(m => m.score === undefined);
    const fs = females.filter(m => m.score !== undefined);
    const fns = females.filter(m => m.score === undefined);
    ms.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    fs.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    snakeDraftToGroups(ms, groups, groupSize.max, malesPerGroup, 'male');
    snakeDraftToGroups(fs, groups, groupSize.max, femalesPerGroup, 'female');
    distributeToGroups(interleaveBySeriesQueue(groupBySeries(mns)), groups, groupSize.max, malesPerGroup, 'male');
    distributeToGroups(interleaveBySeriesQueue(groupBySeries(fns)), groups, groupSize.max, femalesPerGroup, 'female');
  } else {
    distributeToGroups(interleaveBySeriesQueue(groupBySeries(males)), groups, groupSize.max, malesPerGroup, 'male');
    distributeToGroups(interleaveBySeriesQueue(groupBySeries(females)), groups, groupSize.max, femalesPerGroup, 'female');
  }

  for (const g of groups) {
    if (g.members.length < groupSize.min) warnings.push(`${g.groupNumber}조 최소 미달`);
    if (g.members.length > groupSize.max) warnings.push(`${g.groupNumber}조 최대 초과`);
  }
  return { groups, warnings };
}

// ===== 파싱 로직 =====
function parseGender(v) {
  const n = v.toLowerCase().trim();
  if (['여','여자','여성','female','f'].includes(n)) return 'female';
  return 'male';
}
function parseScore(v) { if (!v) return undefined; const n = parseFloat(v); return isNaN(n) ? undefined : n; }
function parseGroupNumber(v) { if (!v) return undefined; const c = v.replace(/[조\s]/g, ''); const n = parseInt(c, 10); return isNaN(n) ? undefined : n; }
function findIndex(headers, keywords) {
  for (let i = 0; i < headers.length; i++) { const h = (headers[i]||'').toLowerCase(); for (const k of keywords) { if (h === k.toLowerCase()) return i; } }
  for (let i = 0; i < headers.length; i++) { const h = (headers[i]||'').toLowerCase(); for (const k of keywords) { const kw = k.toLowerCase(); if (kw.length >= 3 && h.includes(kw)) return i; } }
  return -1;
}
function parseTextInput(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const hdrs = lines[0].split(delim).map(h => h.trim());
  const ni = findIndex(hdrs, ['이름','성명','name']);
  const pi = findIndex(hdrs, ['연락처','전화번호','핸드폰','휴대폰','phone','전화']);
  const gi = findIndex(hdrs, ['성별','gender']);
  const si = findIndex(hdrs, ['직렬','분야','series','직군']);
  const ri = findIndex(hdrs, ['지역','시도','region','응시지역']);
  const sci = findIndex(hdrs, ['성적','점수','필기성적','필기점수','score']);
  const gri = findIndex(hdrs, ['조','편성조','group','스터디조']);
  if (ni === -1) throw new Error('이름 열 없음');
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim).map(c => c.trim());
    const name = cells[ni] || '';
    if (!name) continue;
    result.push({
      id: `m-${i+1}`, name,
      phone: pi >= 0 ? cells[pi]||'' : '',
      gender: parseGender(gi >= 0 ? cells[gi]||'' : ''),
      series: si >= 0 ? cells[si]||'' : '',
      region: ri >= 0 ? cells[ri]||'' : '',
      score: parseScore(sci >= 0 ? cells[sci]||'' : ''),
      preAssignedGroup: gri >= 0 ? parseGroupNumber(cells[gri]||'') : undefined,
    });
  }
  return result;
}

// ===== 헬퍼 =====
const SL = ['일반','경채','101경비단','경행','사이버'];
const RG = ['서울','경기','부산','대구','인천'];
function gen(count, opts = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m-${i+1}`, name: `수험생${i+1}`,
    phone: `010-0000-${String(i).padStart(4,'0')}`,
    gender: opts.allFemale ? 'female' : (opts.allMale ? 'male' : (Math.random() < 0.7 ? 'male' : 'female')),
    series: opts.series ?? SL[Math.floor(Math.random() * SL.length)],
    region: RG[Math.floor(Math.random() * RG.length)],
    score: opts.withScore ? Math.round((50 + Math.random() * 50) * 10) / 10 : undefined,
    preAssignedGroup: undefined,
  }));
}

const BASE = {
  examType: 'police',
  groupSize: { min: 8, max: 10 },
  genderRatio: { mode: 'auto' },
  forceAssignRules: [],
  usePreAssignment: true,
  useScoreBalance: false,
};

function total(r) { return r.groups.reduce((s,g) => s + g.members.length, 0); }
function noDup(r) { const ids = r.groups.flatMap(g => g.members.map(m => m.id)); return ids.length === new Set(ids).size; }
function groupAvgs(r) {
  return r.groups.map(g => {
    const scored = g.members.filter(m => m.score !== undefined);
    return scored.length > 0 ? scored.reduce((s,m) => s + m.score, 0) / scored.length : null;
  }).filter(v => v !== null);
}
function maxDeviation(avgs) {
  if (avgs.length === 0) return 0;
  const avg = avgs.reduce((s,a) => s+a, 0) / avgs.length;
  return Math.max(...avgs.map(a => Math.abs(a - avg)));
}

// ================================================================
// A. 알고리즘 경우의 수 전수 테스트
// ================================================================

console.log('\n========== A1. 인원수 경계값 ==========');
{
  for (const n of [1, 2, 7, 8, 9, 10, 11, 15, 19, 20, 21, 50, 99, 100, 101, 150, 300]) {
    const m = gen(n);
    const r = assignGroups(m, BASE);
    assert(total(r) === n, `${n}명 누락 없음`);
    assert(noDup(r), `${n}명 중복 없음`);
  }
}

console.log('\n========== A2. groupSize 변형 ==========');
{
  // min=max=5 (정확히 5명씩)
  const m = gen(25);
  const r = assignGroups(m, { ...BASE, groupSize: { min: 5, max: 5 } });
  assert(total(r) === 25, 'min=max=5: 25명 배정');
  assert(noDup(r), 'min=max=5: 중복 없음');
  assert(r.groups.length === 5, 'min=max=5: 5조');
  for (const g of r.groups) assert(g.members.length === 5, `${g.groupNumber}조: 정확히 5명`);
}
{
  // min=2, max=3 (작은 조)
  const m = gen(10);
  const r = assignGroups(m, { ...BASE, groupSize: { min: 2, max: 3 } });
  assert(total(r) === 10, 'min=2 max=3: 10명 배정');
  assert(noDup(r), 'min=2 max=3: 중복 없음');
  for (const g of r.groups) assert(g.members.length <= 3, `${g.groupNumber}조: <= 3명`);
}
{
  // min=15, max=20 (큰 조)
  const m = gen(60);
  const r = assignGroups(m, { ...BASE, groupSize: { min: 15, max: 20 } });
  assert(total(r) === 60, 'min=15 max=20: 60명 배정');
  assert(noDup(r), 'min=15 max=20: 중복 없음');
}
{
  // min=max=1 (1인 조)
  const m = gen(5);
  const r = assignGroups(m, { ...BASE, groupSize: { min: 1, max: 1 } });
  assert(total(r) === 5, 'min=max=1: 5명 배정');
  assert(noDup(r), 'min=max=1: 중복 없음');
  assert(r.groups.length === 5, 'min=max=1: 5조');
}

console.log('\n========== A3. 성비 조합 ==========');
{
  // 전원 여자 + auto
  const m = gen(30, { allFemale: true });
  const r = assignGroups(m, BASE);
  assert(total(r) === 30, '전원 여자 auto: 30명 배정');
  assert(noDup(r), '전원 여자 auto: 중복 없음');
}
{
  // 전원 여자 + 수동 7:3
  const m = gen(30, { allFemale: true });
  const r = assignGroups(m, { ...BASE, genderRatio: { mode: 'manual', maleRatio: 7, femaleRatio: 3 } });
  assert(total(r) === 30, '전원 여자 수동 7:3: 30명 배정');
  assert(noDup(r), '전원 여자 수동 7:3: 중복 없음');
}
{
  // 남:여 = 1:9 극단적 비율 + 수동 5:5
  const males = gen(5, { allMale: true });
  const females = gen(45, { allFemale: true });
  females.forEach((f, i) => { f.id = `f-${i+1}`; });
  const m = [...males, ...females];
  const r = assignGroups(m, { ...BASE, genderRatio: { mode: 'manual', maleRatio: 5, femaleRatio: 5 } });
  assert(total(r) === 50, '남1여9 수동5:5: 50명 배정');
  assert(noDup(r), '남1여9 수동5:5: 중복 없음');
}
{
  // 남:여 = 9:1 + 수동 5:5
  const males = gen(45, { allMale: true });
  const females = gen(5, { allFemale: true });
  females.forEach((f, i) => { f.id = `f-${i+1}`; });
  const m = [...males, ...females];
  const r = assignGroups(m, { ...BASE, genderRatio: { mode: 'manual', maleRatio: 5, femaleRatio: 5 } });
  assert(total(r) === 50, '남9여1 수동5:5: 50명 배정');
  assert(noDup(r), '남9여1 수동5:5: 중복 없음');
}
{
  // 수동 10:0 (남자 전용)
  const m = gen(30);
  const r = assignGroups(m, { ...BASE, genderRatio: { mode: 'manual', maleRatio: 10, femaleRatio: 0 } });
  assert(total(r) === 30, '수동 10:0: 30명 배정');
  assert(noDup(r), '수동 10:0: 중복 없음');
}
{
  // 수동 0:10 (여자 전용)
  const m = gen(30);
  const r = assignGroups(m, { ...BASE, genderRatio: { mode: 'manual', maleRatio: 0, femaleRatio: 10 } });
  assert(total(r) === 30, '수동 0:10: 30명 배정');
  assert(noDup(r), '수동 0:10: 중복 없음');
}
{
  // 수동 1:9 극단
  const m = gen(50);
  const r = assignGroups(m, { ...BASE, genderRatio: { mode: 'manual', maleRatio: 1, femaleRatio: 9 } });
  assert(total(r) === 50, '수동 1:9: 50명 배정');
  assert(noDup(r), '수동 1:9: 중복 없음');
}

console.log('\n========== A4. 사전편성 엣지 ==========');
{
  // 전원 사전편성 (자동배정 0명)
  const m = gen(20);
  for (let i = 0; i < 10; i++) m[i].preAssignedGroup = 1;
  for (let i = 10; i < 20; i++) m[i].preAssignedGroup = 2;
  const r = assignGroups(m, BASE);
  assert(total(r) === 20, '전원 사전편성: 20명 배정');
  assert(noDup(r), '전원 사전편성: 중복 없음');
  assert(r.groups[0].members.length === 10, '1조 10명');
  assert(r.groups[1].members.length === 10, '2조 10명');
}
{
  // 한 조에 사전편성이 max 초과
  const m = gen(25);
  for (let i = 0; i < 12; i++) m[i].preAssignedGroup = 1; // 1조에 12명 사전편성 (max=10 초과)
  const r = assignGroups(m, BASE);
  assert(total(r) === 25, '사전편성 초과: 25명 배정');
  assert(noDup(r), '사전편성 초과: 중복 없음');
  assert(r.warnings.some(w => w.includes('초과')), '최대 초과 경고 발생');
}
{
  // 사전편성 조번호 0이나 음수 (잘못된 입력)
  const m = gen(20);
  m[0].preAssignedGroup = 0;
  m[1].preAssignedGroup = -1;
  const r = assignGroups(m, BASE);
  assert(total(r) === 20 || total(r) === 18, '잘못된 조번호: 배정 시도');
  assert(noDup(r), '잘못된 조번호: 중복 없음');
}
{
  // 사전편성 여러 조에 걸쳐 분산
  const m = gen(50);
  m[0].preAssignedGroup = 1;
  m[1].preAssignedGroup = 2;
  m[2].preAssignedGroup = 3;
  m[3].preAssignedGroup = 4;
  m[4].preAssignedGroup = 5;
  const r = assignGroups(m, BASE);
  assert(total(r) === 50, '5조 분산 사전편성: 50명 배정');
  assert(noDup(r), '5조 분산 사전편성: 중복 없음');
  for (let i = 0; i < 5; i++) {
    const gp = r.groups[i].members.some(x => x.id === m[i].id);
    assert(gp, `${i+1}조에 사전편성 멤버 존재`);
  }
}
{
  // 사전편성 + usePreAssignment OFF → 사전편성 무시
  const m = gen(20);
  for (let i = 0; i < 10; i++) m[i].preAssignedGroup = 1;
  const r = assignGroups(m, { ...BASE, usePreAssignment: false });
  assert(total(r) === 20, 'OFF: 20명 배정');
  assert(noDup(r), 'OFF: 중복 없음');
  // 1조에 10명 몰리지 않아야 함 (무작위 배정)
  assert(r.groups.length === 2, 'OFF: 2조 생성');
}

console.log('\n========== A5. 강제배정 엣지 ==========');
{
  // 여러 강제배정 규칙 동시
  const m = gen(50, { series: '일반' });
  for (let i = 0; i < 15; i++) m[i].series = '101경비단';
  for (let i = 15; i < 25; i++) m[i].series = '사이버';
  const r = assignGroups(m, {
    ...BASE,
    forceAssignRules: [
      { id: 'r1', series: '101경비단', countPerGroup: 2 },
      { id: 'r2', series: '사이버', countPerGroup: 1 },
    ],
  });
  assert(total(r) === 50, '복수 규칙: 50명 배정');
  assert(noDup(r), '복수 규칙: 중복 없음');
  for (const g of r.groups) {
    assert(g.members.filter(x => x.series === '101경비단').length >= 2, `${g.groupNumber}조: 101경비단 >= 2`);
    assert(g.members.filter(x => x.series === '사이버').length >= 1, `${g.groupNumber}조: 사이버 >= 1`);
  }
}
{
  // 강제배정 직렬 인원 = 0명
  const m = gen(30, { series: '일반' });
  const r = assignGroups(m, {
    ...BASE,
    forceAssignRules: [{ id: 'r1', series: '사이버', countPerGroup: 1 }],
  });
  assert(r.warnings.some(w => w.includes('사이버') || w.includes('부족')), '0명 직렬: 부족 경고');
  assert(total(r) === 30, '0명 직렬: 30명 배정');
  assert(noDup(r), '0명 직렬: 중복 없음');
}
{
  // countPerGroup > 실제 조당 여유분
  const m = gen(20, { series: '일반' });
  for (let i = 0; i < 20; i++) m[i].series = '101경비단';
  const r = assignGroups(m, {
    ...BASE,
    forceAssignRules: [{ id: 'r1', series: '101경비단', countPerGroup: 15 }],
  });
  assert(total(r) === 20, 'countPerGroup 과다: 20명 배정');
  assert(noDup(r), 'countPerGroup 과다: 중복 없음');
}

console.log('\n========== A6. 성적 균등 엣지 ==========');
{
  // 전원 동점
  const m = gen(30, { withScore: true });
  m.forEach(x => x.score = 75.0);
  const r = assignGroups(m, { ...BASE, useScoreBalance: true });
  assert(total(r) === 30, '전원 동점: 30명 배정');
  assert(noDup(r), '전원 동점: 중복 없음');
  const avgs = groupAvgs(r);
  assert(maxDeviation(avgs) < 0.1, '전원 동점: 편차 0');
}
{
  // 극단적 성적 분포 (1명 100점, 나머지 0점)
  const m = gen(30, { withScore: true });
  m.forEach(x => x.score = 0);
  m[0].score = 100;
  const r = assignGroups(m, { ...BASE, useScoreBalance: true });
  assert(total(r) === 30, '극단 성적: 30명 배정');
  assert(noDup(r), '극단 성적: 중복 없음');
}
{
  // score = 0 인 멤버 (0은 유효한 성적)
  const m = gen(20, { withScore: true });
  m.forEach(x => x.score = 0);
  const r = assignGroups(m, { ...BASE, useScoreBalance: true });
  assert(total(r) === 20, 'score=0: 20명 배정');
  assert(noDup(r), 'score=0: 중복 없음');
}
{
  // 성적 없는 사람 1명만 + 나머지 전부 성적 있음
  const m = gen(30, { withScore: true });
  m[0].score = undefined;
  const r = assignGroups(m, { ...BASE, useScoreBalance: true });
  assert(total(r) === 30, '1명 성적 없음: 30명 배정');
  assert(noDup(r), '1명 성적 없음: 중복 없음');
}
{
  // 성적 있는 사람 1명만 + 나머지 전부 성적 없음
  const m = gen(30);
  m[0].score = 85.5;
  const r = assignGroups(m, { ...BASE, useScoreBalance: true });
  assert(total(r) === 30, '1명만 성적: 30명 배정');
  assert(noDup(r), '1명만 성적: 중복 없음');
}
{
  // 성적 균등 + 수동 성비 + 극단적 성비
  const males = gen(40, { allMale: true, withScore: true });
  const females = gen(10, { allFemale: true, withScore: true });
  females.forEach((f, i) => { f.id = `f-${i+1}`; });
  const m = [...males, ...females];
  const r = assignGroups(m, {
    ...BASE,
    useScoreBalance: true,
    genderRatio: { mode: 'manual', maleRatio: 8, femaleRatio: 2 },
  });
  assert(total(r) === 50, '성적균등+수동성비: 50명 배정');
  assert(noDup(r), '성적균등+수동성비: 중복 없음');
}

console.log('\n========== A7. 3중 조합 전수 ==========');
// usePreAssignment(T/F) × useScoreBalance(T/F) × forceAssign(유/무) × genderRatio(auto/manual)
{
  const combos = [];
  for (const pre of [true, false]) {
    for (const score of [true, false]) {
      for (const force of [true, false]) {
        for (const gender of ['auto', 'manual']) {
          combos.push({ pre, score, force, gender });
        }
      }
    }
  }
  for (const c of combos) {
    const m = gen(40, { withScore: c.score });
    if (c.pre) { m[0].preAssignedGroup = 1; m[1].preAssignedGroup = 2; }
    if (c.force) { for (let i = 10; i < 18; i++) m[i].series = '101경비단'; }
    const settings = {
      ...BASE,
      usePreAssignment: c.pre,
      useScoreBalance: c.score,
      forceAssignRules: c.force ? [{ id: 'r1', series: '101경비단', countPerGroup: 1 }] : [],
      genderRatio: c.gender === 'manual'
        ? { mode: 'manual', maleRatio: 7, femaleRatio: 3 }
        : { mode: 'auto' },
    };
    const label = `pre=${c.pre} score=${c.score} force=${c.force} gender=${c.gender}`;
    const r = assignGroups(m, settings);
    assert(total(r) === 40, `${label}: 40명 배정`);
    assert(noDup(r), `${label}: 중복 없음`);
  }
}

console.log('\n========== A8. 직렬 분산 검증 ==========');
{
  // 직렬 5개 × 10명씩 = 50명, 5조
  const m = [];
  for (const s of SL) {
    for (let i = 0; i < 10; i++) {
      m.push({
        id: `${s}-${i}`, name: `${s}${i}`, phone: '', gender: Math.random() < 0.7 ? 'male' : 'female',
        series: s, region: '서울', score: undefined, preAssignedGroup: undefined,
      });
    }
  }
  const r = assignGroups(m, BASE);
  assert(total(r) === 50, '직렬 균등: 50명 배정');
  assert(noDup(r), '직렬 균등: 중복 없음');
  // 각 조에 최소 3개 이상 직렬이 있어야 함 (잘 섞였으면)
  for (const g of r.groups) {
    const seriesSet = new Set(g.members.map(x => x.series));
    assert(seriesSet.size >= 3, `${g.groupNumber}조: ${seriesSet.size}개 직렬 >= 3`);
  }
}

console.log('\n========== A9. 재편성 결과 일관성 (10회 반복) ==========');
{
  const m = gen(50, { withScore: true });
  for (let t = 0; t < 10; t++) {
    const r = assignGroups(m, { ...BASE, useScoreBalance: true });
    assert(total(r) === 50, `재편성 #${t+1}: 50명 배정`);
    assert(noDup(r), `재편성 #${t+1}: 중복 없음`);
  }
}

// ================================================================
// B. 텍스트 파싱 경우의 수
// ================================================================

console.log('\n========== B1. 다양한 헤더 키워드 ==========');
{
  const t1 = '성명\t전화번호\tgender\tseries\tregion\tscore\tgroup\n홍길동\t010-1111-2222\tmale\t일반\t서울\t80\t2';
  const m = parseTextInput(t1);
  assert(m.length === 1, '다양한 헤더: 1명');
  assert(m[0].name === '홍길동', '다양한 헤더: 이름 매칭');
  assert(m[0].gender === 'male', '다양한 헤더: 성별');
  assert(m[0].score === 80, '다양한 헤더: 성적');
  assert(m[0].preAssignedGroup === 2, '다양한 헤더: 조');
}
{
  const t2 = 'name,phone,gender,series,region\nJohn,010-0000-0000,male,일반,서울';
  const m = parseTextInput(t2);
  assert(m.length === 1, '영문 헤더: 1명');
  assert(m[0].name === 'John', '영문 헤더: 이름');
}

console.log('\n========== B2. 구분자 자동 감지 ==========');
{
  // 탭
  const m1 = parseTextInput('이름\t성별\n가나다\t여');
  assert(m1[0].gender === 'female', '탭: 여 인식');
  // 쉼표
  const m2 = parseTextInput('이름,성별\n가나다,여자');
  assert(m2[0].gender === 'female', '쉼표: 여자 인식');
}

console.log('\n========== B3. 성별 변환 전수 ==========');
{
  const genders = [
    ['남', 'male'], ['남자', 'male'], ['남성', 'male'], ['male', 'male'], ['Male', 'male'], ['MALE', 'male'], ['m', 'male'], ['M', 'male'],
    ['여', 'female'], ['여자', 'female'], ['여성', 'female'], ['female', 'female'], ['Female', 'female'], ['FEMALE', 'female'], ['f', 'female'], ['F', 'female'],
    ['', 'male'], ['??', 'male'], ['기타', 'male'],
  ];
  for (const [input, expected] of genders) {
    assert(parseGender(input) === expected, `parseGender('${input}') === '${expected}'`);
  }
}

console.log('\n========== B4. parseGroupNumber 전수 ==========');
{
  const cases = [
    ['1', 1], ['1조', 1], ['3 조', 3], ['12', 12], ['0', 0],
    ['', undefined], ['abc', undefined], ['조', undefined],
  ];
  for (const [input, expected] of cases) {
    const result = parseGroupNumber(input);
    assert(result === expected, `parseGroupNumber('${input}') === ${expected} (실제: ${result})`);
  }
}

console.log('\n========== B5. parseScore 전수 ==========');
{
  const cases = [
    ['85.5', 85.5], ['100', 100], ['0', 0], ['0.0', 0],
    ['-5', -5], ['99.99', 99.99],
    ['', undefined], ['abc', undefined], ['N/A', undefined],
  ];
  for (const [input, expected] of cases) {
    const result = parseScore(input);
    assert(result === expected, `parseScore('${input}') === ${expected} (실제: ${result})`);
  }
}

console.log('\n========== B6. 특수 텍스트 입력 ==========');
{
  // Windows CRLF
  const m1 = parseTextInput('이름,성별\r\n가나다,남\r\n나다라,여');
  assert(m1.length === 2, 'CRLF: 2명');
}
{
  // 앞뒤 공백이 있는 셀
  const m2 = parseTextInput('이름 , 성별 , 직렬\n 홍길동 , 남 , 일반 ');
  assert(m2[0].name === '홍길동', '공백 trim: 이름');
  assert(m2[0].series === '일반', '공백 trim: 직렬');
}
{
  // 컬럼 순서가 역순
  const m3 = parseTextInput('지역,직렬,성별,연락처,이름\n서울,일반,남,010-0000-0000,홍길동');
  assert(m3[0].name === '홍길동', '역순 컬럼: 이름');
  assert(m3[0].region === '서울', '역순 컬럼: 지역');
  assert(m3[0].gender === 'male', '역순 컬럼: 성별');
}
{
  // 이름만 있는 최소 데이터
  const m4 = parseTextInput('이름\n가나다\n나다라');
  assert(m4.length === 2, '이름만: 2명');
  assert(m4[0].gender === 'male', '이름만: 기본 성별 남');
  assert(m4[0].series === '', '이름만: 빈 직렬');
}
{
  // 빈 텍스트
  const m5 = parseTextInput('');
  assert(m5.length === 0, '빈 텍스트: 0명');
}
{
  // 헤더 없이 데이터만 (이름 열을 찾을 수 없음)
  let threw = false;
  try { parseTextInput('가나다,남,일반\n나다라,여,경행'); } catch { threw = true; }
  assert(threw, '헤더 없음: 에러 발생');
}
{
  // 쉼표가 포함된 데이터에서 탭 구분
  const m6 = parseTextInput('이름\t성별\t직렬\n홍,길동\t남\t일반');
  assert(m6[0].name === '홍,길동', '탭 구분 시 쉼표 포함 이름 보존');
}

console.log('\n========== B7. 대량 텍스트 파싱 ==========');
{
  let text = '이름,성별,직렬,지역,필기성적,조\n';
  for (let i = 0; i < 500; i++) {
    text += `수험생${i},${i%3===0?'여':'남'},일반,서울,${(50+Math.random()*50).toFixed(1)},\n`;
  }
  const m = parseTextInput(text);
  assert(m.length === 500, '500명 파싱');
  assert(m.filter(x => x.gender === 'female').length > 0, '여성 포함');
  assert(m.filter(x => x.score !== undefined).length === 500, '전원 성적 있음');
}

// ================================================================
// C. 실제 시나리오 모의
// ================================================================

console.log('\n========== C1. 실제 경찰 시나리오 ==========');
{
  // 경찰 80명: 일반 40, 경채 15, 101경비단 10, 경행 8, 사이버 7
  // 남 56, 여 24
  // 101경비단 각 조 1명 강제
  // 일부 사전편성, 성적 있음
  const m = [];
  const seriesDist = [
    ['일반', 40], ['경채', 15], ['101경비단', 10], ['경행', 8], ['사이버', 7],
  ];
  let id = 0;
  for (const [series, cnt] of seriesDist) {
    for (let i = 0; i < cnt; i++) {
      const isFemale = id < 56 ? (Math.random() < 0.3) : true;
      m.push({
        id: `p-${id}`, name: `경찰${id}`, phone: `010-${String(id).padStart(8,'0')}`,
        gender: isFemale ? 'female' : 'male',
        series, region: RG[id % 5],
        score: Math.random() < 0.8 ? Math.round((50 + Math.random()*50)*10)/10 : undefined,
        preAssignedGroup: undefined,
      });
      id++;
    }
  }
  // 사전편성 5명
  m[0].preAssignedGroup = 1;
  m[1].preAssignedGroup = 1;
  m[2].preAssignedGroup = 3;
  m[3].preAssignedGroup = 5;
  m[4].preAssignedGroup = 8;

  const r = assignGroups(m, {
    ...BASE,
    useScoreBalance: true,
    forceAssignRules: [{ id: 'r1', series: '101경비단', countPerGroup: 1 }],
  });
  assert(total(r) === 80, '경찰 80명: 배정 완료');
  assert(noDup(r), '경찰 80명: 중복 없음');
  assert(r.groups[0].members.some(x => x.id === 'p-0'), '사전편성 p-0 → 1조');
  assert(r.groups[2].members.some(x => x.id === 'p-2'), '사전편성 p-2 → 3조');

  // 조별 성적 편차 확인
  const avgs = groupAvgs(r);
  if (avgs.length > 1) {
    const dev = maxDeviation(avgs);
    console.log(`  경찰 시나리오 조별 성적 편차: ${dev.toFixed(1)}점`);
    assert(dev < 8, `편차 ${dev.toFixed(1)} < 8점`);
  }
}

console.log('\n========== C2. 실제 소방 시나리오 ==========');
{
  const fireSeries = ['일반', '구급', '구조', '화학', '항공', '정보통신'];
  const m = [];
  const dist = [['일반', 30], ['구급', 15], ['구조', 10], ['화학', 5], ['항공', 3], ['정보통신', 2]];
  let id = 0;
  for (const [series, cnt] of dist) {
    for (let i = 0; i < cnt; i++) {
      m.push({
        id: `f-${id}`, name: `소방${id}`, phone: `010-${String(id).padStart(8,'0')}`,
        gender: Math.random() < 0.85 ? 'male' : 'female',
        series, region: RG[id % 5],
        score: Math.round((50 + Math.random()*50)*10)/10,
        preAssignedGroup: undefined,
      });
      id++;
    }
  }
  const r = assignGroups(m, {
    examType: 'fire',
    groupSize: { min: 8, max: 10 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [{ id: 'r1', series: '구급', countPerGroup: 2 }],
    usePreAssignment: true,
    useScoreBalance: true,
  });
  assert(total(r) === 65, '소방 65명: 배정 완료');
  assert(noDup(r), '소방 65명: 중복 없음');
  for (const g of r.groups) {
    const emt = g.members.filter(x => x.series === '구급').length;
    assert(emt >= 2, `${g.groupNumber}조: 구급 ${emt}명 >= 2`);
  }
}

console.log('\n========== C3. 텍스트 → 알고리즘 연동 ==========');
{
  const csv = `이름,연락처,성별,직렬,지역,필기성적,조
홍길동,010-1111-2222,남,일반,서울,85.5,
김영희,010-3333-4444,여,101경비단,경기,92.0,1
이순신,010-5555-6666,남,경행,부산,78.3,
유관순,010-7777-8888,여,일반,대구,,2
장보고,010-9999-0000,남,사이버,인천,88.1,
세종대왕,010-1234-5678,남,일반,서울,71.2,
신사임당,010-8765-4321,여,경채,경기,95.0,
강감찬,010-1122-3344,남,101경비단,부산,82.7,
안중근,010-5566-7788,남,일반,대구,79.8,
윤봉길,010-9900-1122,남,경행,인천,86.4,`;
  const m = parseTextInput(csv);
  assert(m.length === 10, 'CSV 파싱: 10명');
  assert(m[1].preAssignedGroup === 1, '김영희: 1조 사전편성');
  assert(m[3].preAssignedGroup === 2, '유관순: 2조 사전편성');
  assert(m[3].score === undefined, '유관순: 성적 없음');
  assert(m[0].score === 85.5, '홍길동: 성적 85.5');

  const r = assignGroups(m, {
    ...BASE,
    groupSize: { min: 4, max: 5 },
    useScoreBalance: true,
    forceAssignRules: [{ id: 'r1', series: '101경비단', countPerGroup: 1 }],
  });
  assert(total(r) === 10, '연동: 10명 배정');
  assert(noDup(r), '연동: 중복 없음');
  // 김영희 → 1조
  assert(r.groups[0].members.some(x => x.name === '김영희'), '김영희 → 1조');
  // 유관순 → 2조
  assert(r.groups[1].members.some(x => x.name === '유관순'), '유관순 → 2조');
}

// ================================================================
// 결과 요약
// ================================================================

console.log('\n' + '='.repeat(60));
console.log(`결과: ${passed} 통과 / ${failed} 실패 (총 ${passed + failed}개)`);
if (failed > 0) {
  console.log('\n실패 목록:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('모든 테스트 통과!');
}
