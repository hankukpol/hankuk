/**
 * 새 기능 테스트: 나이 균등 분배, 복합 랭킹, 엑셀 복원
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${label}`);
  }
}

// ==================== 인라인 함수 (algorithm.ts) ====================

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
    for (const idx of order) {
      if (i < queues[idx].length) result.push(queues[idx][i]);
    }
  }
  return result;
}

function distributeToGroups(queue, groups, maxSize, genderLimitPerGroup, gender) {
  let groupIdx = 0;
  for (const member of queue) {
    let attempts = 0;
    while (attempts < groups.length) {
      const g = groups[groupIdx];
      if (g.members.length < maxSize) {
        const gc = g.members.filter(m => m.gender === gender).length;
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
      const g = groups[groupIdx];
      if (g.members.length < maxSize) {
        const gc = g.members.filter(m => m.gender === gender).length;
        if (genderLimitPerGroup === null || gc < genderLimitPerGroup) break;
      }
      groupIdx += direction;
      if (groupIdx >= groups.length) { groupIdx = groups.length - 1; direction = -1; }
      else if (groupIdx < 0) { groupIdx = 0; direction = 1; }
      attempts++;
    }
    if (attempts < groups.length) groups[groupIdx].members.push(member);
    else {
      const smallest = groups.reduce((min, g) => g.members.length < min.members.length ? g : min);
      if (smallest.members.length < maxSize) smallest.members.push(member);
    }
    groupIdx += direction;
    if (groupIdx >= groups.length) { groupIdx = groups.length - 1; direction = -1; }
    else if (groupIdx < 0) { groupIdx = 0; direction = 1; }
  }
}

function splitByRelevantData(members, useScore, useAge) {
  const withData = [], withoutData = [];
  for (const m of members) {
    if ((useScore && m.score !== undefined) || (useAge && m.age !== undefined)) withData.push(m);
    else withoutData.push(m);
  }
  return { withData, withoutData };
}

function computeRanks(members, getValue, descending) {
  const indexed = members.map((m, i) => ({ index: i, value: getValue(m) }));
  indexed.sort((a, b) => descending ? b.value - a.value : a.value - b.value);
  const ranks = new Array(members.length);
  for (let i = 0; i < indexed.length; i++) ranks[indexed[i].index] = i + 1;
  return ranks;
}

function sortByCompositeRank(members, useScore, useAge) {
  if (members.length === 0) return;
  if (useScore && useAge) {
    const sr = computeRanks(members, m => m.score ?? 0, true);
    const ar = computeRanks(members, m => m.age ?? 0, true);
    const cs = members.map((m, i) => ({ member: m, rank: sr[i] + ar[i] }));
    cs.sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < members.length; i++) members[i] = cs[i].member;
  } else if (useScore) {
    members.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  } else if (useAge) {
    members.sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  }
}

function assignGroups(members, settings) {
  const warnings = [];
  const { groupSize, genderRatio, forceAssignRules, usePreAssignment, useScoreBalance, useAgeBalance } = settings;
  if (members.length === 0) return { groups: [], warnings: ['빈 명단'] };

  const pre = usePreAssignment ? members.filter(m => m.preAssignedGroup !== undefined) : [];
  const maxPre = pre.reduce((max, m) => Math.max(max, m.preAssignedGroup), 0);
  const totalBySize = Math.max(1, Math.ceil(members.length / groupSize.max));
  const totalGroups = Math.max(totalBySize, maxPre);
  const groups = Array.from({ length: totalGroups }, (_, i) => ({ groupNumber: i + 1, members: [] }));
  const assigned = new Set();

  for (const m of pre) {
    const idx = m.preAssignedGroup - 1;
    if (idx >= 0 && idx < groups.length) { groups[idx].members.push(m); assigned.add(m.id); }
  }
  for (const rule of forceAssignRules) {
    const targets = members.filter(m => m.series === rule.series && !assigned.has(m.id));
    if (targets.length < rule.countPerGroup * totalGroups) warnings.push(`'${rule.series}' 부족`);
    const sh = shuffle(targets); let idx = 0;
    for (const g of groups) { let a = 0; while (a < rule.countPerGroup && idx < sh.length) { g.members.push(sh[idx]); assigned.add(sh[idx].id); idx++; a++; } }
  }

  const rem = members.filter(m => !assigned.has(m.id));
  const males = shuffle(rem.filter(m => m.gender === 'male'));
  const females = shuffle(rem.filter(m => m.gender === 'female'));
  let mpg = null, fpg = null;
  if (genderRatio.mode === 'manual' && genderRatio.maleRatio !== undefined && genderRatio.femaleRatio !== undefined) {
    const rt = genderRatio.maleRatio + genderRatio.femaleRatio;
    mpg = Math.round((genderRatio.maleRatio / rt) * groupSize.max); fpg = groupSize.max - mpg;
  }

  if (useScoreBalance || useAgeBalance) {
    const { withData: mwd, withoutData: mwod } = splitByRelevantData(males, useScoreBalance, useAgeBalance);
    const { withData: fwd, withoutData: fwod } = splitByRelevantData(females, useScoreBalance, useAgeBalance);
    sortByCompositeRank(mwd, useScoreBalance, useAgeBalance);
    sortByCompositeRank(fwd, useScoreBalance, useAgeBalance);
    snakeDraftToGroups(mwd, groups, groupSize.max, mpg, 'male');
    snakeDraftToGroups(fwd, groups, groupSize.max, fpg, 'female');
    distributeToGroups(interleaveBySeriesQueue(groupBySeries(mwod)), groups, groupSize.max, mpg, 'male');
    distributeToGroups(interleaveBySeriesQueue(groupBySeries(fwod)), groups, groupSize.max, fpg, 'female');
  } else {
    distributeToGroups(interleaveBySeriesQueue(groupBySeries(males)), groups, groupSize.max, mpg, 'male');
    distributeToGroups(interleaveBySeriesQueue(groupBySeries(females)), groups, groupSize.max, fpg, 'female');
  }

  for (const g of groups) {
    if (g.members.length < groupSize.min) warnings.push(`${g.groupNumber}조 부족`);
    if (g.members.length > groupSize.max) warnings.push(`${g.groupNumber}조 초과`);
  }
  return { groups, warnings };
}

// ==================== 인라인 파싱 (excel.ts) ====================

function findIndex(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase();
    for (const kw of keywords) { if (h === kw.toLowerCase()) return i; }
  }
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase();
    for (const kw of keywords) { const k = kw.toLowerCase(); if (k.length >= 3 && h.includes(k)) return i; }
  }
  return -1;
}

function parseGender(v) { const n = v.toLowerCase().trim(); return ['여','여자','여성','female','f'].includes(n) ? 'female' : 'male'; }
function parseScore(v) { if (!v) return undefined; const n = parseFloat(v); return isNaN(n) ? undefined : n; }
function parseAge(v) {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  if (isNaN(n)) return undefined;
  const cy = new Date().getFullYear();
  if (n >= 1950 && n <= cy) return cy - n;
  return n > 0 ? n : undefined;
}
function parseGroupNumber(v) { if (!v) return undefined; const c = v.replace(/[조\s]/g, ''); const n = parseInt(c, 10); return isNaN(n) ? undefined : n; }

function detectRestoreModeText(lines, delim, gIdx) {
  if (gIdx < 0 || lines.length < 2) return false;
  const h = lines[0].split(delim).map(x => x.trim());
  if (h[gIdx] !== '조') return false;
  const d = lines[1].split(delim).map(x => x.trim());
  return /^\d+조$/.test(d[gIdx] || '');
}

function buildRestoredGroups(members) {
  const map = new Map();
  for (const m of members) {
    if (m.preAssignedGroup === undefined) continue;
    const list = map.get(m.preAssignedGroup) || [];
    list.push(m); map.set(m.preAssignedGroup, list);
  }
  const groups = [];
  for (const key of Array.from(map.keys()).sort((a, b) => a - b)) groups.push({ groupNumber: key, members: map.get(key) });
  return groups;
}

function parseTextInput(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { members: [] };
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const hc = lines[0].split(delim).map(h => h.trim());
  const ni = findIndex(hc, ['이름','성명','name']);
  const pi = findIndex(hc, ['연락처','전화번호','핸드폰','휴대폰','phone','전화']);
  const gi = findIndex(hc, ['성별','gender']);
  const si = findIndex(hc, ['직렬','분야','series','직군']);
  const ri = findIndex(hc, ['지역','시도','region','응시지역']);
  const sci = findIndex(hc, ['성적','점수','필기성적','필기점수','score']);
  const gri = findIndex(hc, ['조','편성조','group','스터디조']);
  const ai = findIndex(hc, ['나이','연령','age','생년','출생년도']);
  if (ni === -1) throw new Error('이름 열 없음');
  const isRestore = detectRestoreModeText(lines, delim, gri);
  const members = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(delim).map(x => x.trim());
    const name = c[ni] || ''; if (!name) continue;
    members.push({
      id: `member-${i + 1}`, name,
      phone: pi >= 0 ? c[pi] || '' : '',
      gender: parseGender(gi >= 0 ? c[gi] || '' : ''),
      series: si >= 0 ? c[si] || '' : '',
      region: ri >= 0 ? c[ri] || '' : '',
      score: parseScore(sci >= 0 ? c[sci] || '' : ''),
      age: parseAge(ai >= 0 ? c[ai] || '' : ''),
      preAssignedGroup: parseGroupNumber(gri >= 0 ? c[gri] || '' : ''),
    });
  }
  if (isRestore) return { members, restoredGroups: buildRestoredGroups(members) };
  return { members };
}

// ==================== 헬퍼 ====================

function makeMember(id, ov = {}) {
  return { id: `m-${id}`, name: `멤버${id}`, phone: '', gender: 'male', series: '일반', region: '서울', ...ov };
}
function baseSettings(ov = {}) {
  return { examType: 'police', groupSize: { min: 4, max: 8 }, genderRatio: { mode: 'auto' }, forceAssignRules: [], usePreAssignment: false, useScoreBalance: false, useAgeBalance: false, ...ov };
}

// ==================== 테스트 ====================

console.log('\n========== F1. 나이 균등 기본 ==========');
{
  const ms = []; for (let i = 0; i < 40; i++) ms.push(makeMember(i, { age: 20 + i }));
  const { groups } = assignGroups(ms, baseSettings({ useAgeBalance: true }));
  assert(groups.length >= 4, 'F1-1: 최소 4조');
  const avgs = groups.map(g => { const a = g.members.filter(m => m.age !== undefined).map(m => m.age); return a.reduce((x,y) => x+y, 0) / a.length; });
  const oa = avgs.reduce((x,y) => x+y, 0) / avgs.length;
  const md = Math.max(...avgs.map(a => Math.abs(a - oa)));
  assert(md < 5, `F1-2: 편차 < 5 (${md.toFixed(1)})`);
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 40, 'F1-3: 전원');
  console.log(`  평균 나이: ${avgs.map(a => a.toFixed(1)).join(', ')} / 편차: ${md.toFixed(1)}`);
}

console.log('\n========== F2. 나이 부분 존재 ==========');
{
  const ms = [];
  for (let i = 0; i < 20; i++) ms.push(makeMember(i, { age: 20 + i*2 }));
  for (let i = 20; i < 40; i++) ms.push(makeMember(i, {}));
  const { groups } = assignGroups(ms, baseSettings({ useAgeBalance: true }));
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 40, 'F2-1: 전원');
  const ac = groups.map(g => g.members.filter(m => m.age !== undefined).length);
  assert(Math.max(...ac) - Math.min(...ac) <= 2, 'F2-2: 나이 균등 분산');
}

console.log('\n========== F3. 복합 랭킹 ==========');
{
  const ms = []; for (let i = 0; i < 40; i++) ms.push(makeMember(i, { score: 180 + i*1.5, age: 22 + (i%20) }));
  const { groups } = assignGroups(ms, baseSettings({ useScoreBalance: true, useAgeBalance: true }));
  const as = groups.map(g => { const s = g.members.map(m => m.score); return s.reduce((a,b) => a+b, 0) / s.length; });
  const os = as.reduce((a,b) => a+b, 0) / as.length;
  const sd = Math.max(...as.map(a => Math.abs(a - os)));
  const aa = groups.map(g => { const a = g.members.map(m => m.age); return a.reduce((x,y) => x+y, 0) / a.length; });
  const oa = aa.reduce((a,b) => a+b, 0) / aa.length;
  const ad = Math.max(...aa.map(a => Math.abs(a - oa)));
  assert(sd < 10, `F3-1: 성적 편차 < 10 (${sd.toFixed(1)})`);
  assert(ad < 5, `F3-2: 나이 편차 < 5 (${ad.toFixed(1)})`);
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 40, 'F3-3: 전원');
  console.log(`  성적 편차: ${sd.toFixed(1)}, 나이 편차: ${ad.toFixed(1)}`);
}

console.log('\n========== F4. 나이만 ON ==========');
{
  const ms = []; for (let i = 0; i < 30; i++) ms.push(makeMember(i, { age: 20 + i }));
  const { groups } = assignGroups(ms, baseSettings({ useAgeBalance: true }));
  const avgs = groups.map(g => { const a = g.members.map(m => m.age); return a.reduce((x,y) => x+y, 0) / a.length; });
  const oa = avgs.reduce((a,b) => a+b, 0) / avgs.length;
  const md = Math.max(...avgs.map(a => Math.abs(a - oa)));
  assert(md < 5, `F4-1: 편차 < 5 (${md.toFixed(1)})`);
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 30, 'F4-2: 전원');
}

console.log('\n========== F5. 성적 ON + 나이 OFF ==========');
{
  const ms = []; for (let i = 0; i < 30; i++) ms.push(makeMember(i, { score: 180 + i*2 }));
  const { groups } = assignGroups(ms, baseSettings({ useScoreBalance: true }));
  const as = groups.map(g => { const s = g.members.map(m => m.score); return s.reduce((a,b) => a+b, 0) / s.length; });
  const os = as.reduce((a,b) => a+b, 0) / as.length;
  const d = Math.max(...as.map(a => Math.abs(a - os)));
  assert(d < 10, `F5-1: 편차 < 10 (${d.toFixed(1)})`);
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 30, 'F5-2: 전원');
}

console.log('\n========== F6. 나이 + 성별 ==========');
{
  const ms = [];
  for (let i = 0; i < 20; i++) ms.push(makeMember(i, { gender: 'male', age: 20 + i }));
  for (let i = 0; i < 20; i++) ms.push(makeMember(20 + i, { gender: 'female', age: 22 + i }));
  const { groups } = assignGroups(ms, baseSettings({ useAgeBalance: true }));
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 40, 'F6-1: 전원');
  assert(groups.every(g => g.members.some(m => m.gender === 'male') && g.members.some(m => m.gender === 'female')), 'F6-2: 남녀 존재');
}

console.log('\n========== F7. 나이 OFF ==========');
{
  const ms = []; for (let i = 0; i < 30; i++) ms.push(makeMember(i, { age: 20 + i }));
  const { groups } = assignGroups(ms, baseSettings({ useAgeBalance: false }));
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 30, 'F7-1: 전원');
}

console.log('\n========== F8. 300명 복합 랭킹 ==========');
{
  const ms = [], sr = ['일반','경채','101경비단','경행','법무회계','사이버','인사'];
  for (let i = 0; i < 300; i++) ms.push(makeMember(i, { gender: i < 220 ? 'male' : 'female', series: sr[i%7], age: 22 + (i%20), score: 180 + Math.random()*70, region: ['대구','경북','서울','부산'][i%4] }));
  const { groups } = assignGroups(ms, baseSettings({ groupSize: { min: 8, max: 10 }, useScoreBalance: true, useAgeBalance: true }));
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 300, 'F8-1: 전원');
  assert(groups.length >= 30, `F8-2: ${groups.length}조`);
  const as = groups.map(g => { const s = g.members.filter(m => m.score !== undefined).map(m => m.score); return s.length > 0 ? s.reduce((a,b) => a+b,0)/s.length : 0; });
  const os = as.reduce((a,b) => a+b,0) / as.length;
  const sd = Math.max(...as.map(a => Math.abs(a - os)));
  const aa = groups.map(g => { const a = g.members.filter(m => m.age !== undefined).map(m => m.age); return a.length > 0 ? a.reduce((x,y) => x+y,0)/a.length : 0; });
  const oa = aa.reduce((a,b) => a+b,0) / aa.length;
  const ad = Math.max(...aa.map(a => Math.abs(a - oa)));
  assert(sd < 15, `F8-3: 성적 편차 < 15 (${sd.toFixed(1)})`);
  assert(ad < 5, `F8-4: 나이 편차 < 5 (${ad.toFixed(1)})`);
  console.log(`  ${groups.length}조, 성적: ${sd.toFixed(1)}, 나이: ${ad.toFixed(1)}`);
}

console.log('\n========== F9. 사전편성 + 나이 ==========');
{
  const ms = [];
  ms.push(makeMember(0, { age: 25, preAssignedGroup: 1 }));
  ms.push(makeMember(1, { age: 35, preAssignedGroup: 1 }));
  ms.push(makeMember(2, { age: 28, preAssignedGroup: 2 }));
  ms.push(makeMember(3, { age: 40, preAssignedGroup: 2 }));
  for (let i = 4; i < 40; i++) ms.push(makeMember(i, { age: 20 + (i%25) }));
  const { groups } = assignGroups(ms, baseSettings({ usePreAssignment: true, useAgeBalance: true }));
  const g1 = groups.find(g => g.groupNumber === 1)?.members || [];
  const g2 = groups.find(g => g.groupNumber === 2)?.members || [];
  assert(g1.some(m => m.id === 'm-0'), 'F9-1: 1조 사전편성');
  assert(g1.some(m => m.id === 'm-1'), 'F9-2: 1조 사전편성');
  assert(g2.some(m => m.id === 'm-2'), 'F9-3: 2조 사전편성');
  assert(g2.some(m => m.id === 'm-3'), 'F9-4: 2조 사전편성');
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 40, 'F9-5: 전원');
}

console.log('\n========== F10. 강제배정 + 나이 ==========');
{
  const ms = [];
  for (let i = 0; i < 10; i++) ms.push(makeMember(i, { series: '사이버', age: 25 + i }));
  for (let i = 10; i < 40; i++) ms.push(makeMember(i, { series: '일반', age: 20 + (i%20) }));
  const { groups } = assignGroups(ms, baseSettings({ useAgeBalance: true, forceAssignRules: [{ id: 'r1', series: '사이버', countPerGroup: 2 }] }));
  for (const g of groups) assert(g.members.filter(m => m.series === '사이버').length === 2, `F10: ${g.groupNumber}조 사이버 2명`);
  assert(groups.reduce((s,g) => s + g.members.length, 0) === 40, 'F10: 전원');
}

console.log('\n========== R1. 텍스트 복원 감지 ==========');
{
  const r = parseTextInput(`조\t이름\t연락처\t성별\t직렬\t지역\n1조\t홍길동\t010-1111-1111\t남\t일반\t서울\n1조\t김영희\t010-2222-2222\t여\t경채\t대구\n2조\t이철수\t010-3333-3333\t남\t일반\t부산\n2조\t박민수\t010-4444-4444\t남\t경행\t경기`);
  assert(r.restoredGroups !== undefined, 'R1-1: 복원 감지');
  assert(r.restoredGroups?.length === 2, 'R1-2: 2조');
  assert(r.restoredGroups?.[0].members.length === 2, 'R1-3: 1조 2명');
  assert(r.restoredGroups?.[1].members.length === 2, 'R1-4: 2조 2명');
  assert(r.members.length === 4, 'R1-5: 전체 4명');
}

console.log('\n========== R2. 일반 명단 ==========');
{
  const r = parseTextInput(`이름\t연락처\t성별\t직렬\t지역\t조\n홍길동\t010-1111-1111\t남\t일반\t서울\t\n김영희\t010-2222-2222\t여\t경채\t대구\t`);
  assert(r.restoredGroups === undefined, 'R2-1: 복원 아님');
  assert(r.members.length === 2, 'R2-2: 2명');
}

console.log('\n========== R3. 숫자만 (복원 아님) ==========');
{
  const r = parseTextInput(`이름\t성별\t직렬\t조\n홍길동\t남\t일반\t1\n김영희\t여\t경채\t2`);
  assert(r.restoredGroups === undefined, 'R3-1: 숫자만이면 복원 아님');
}

console.log('\n========== R4. 나이+성적 포함 복원 ==========');
{
  const r = parseTextInput(`조\t이름\t성별\t직렬\t지역\t나이\t필기성적\n1조\t홍길동\t남\t일반\t서울\t28\t195.5\n1조\t김영희\t여\t경채\t대구\t25\t210.3\n2조\t이철수\t남\t일반\t부산\t32\t188.0\n2조\t박민수\t남\t경행\t경기\t27\t201.7\n3조\t최유진\t여\t일반\t대전\t30\t225.0\n3조\t정하은\t여\t사이버\t인천\t24\t198.5`);
  assert(r.restoredGroups?.length === 3, 'R4-1: 3조');
  assert(r.members[0].age === 28, 'R4-2: 나이');
  assert(r.members[0].score === 195.5, 'R4-3: 성적');
}

console.log('\n========== R5. CSV 복원 ==========');
{
  const r = parseTextInput(`조,이름,성별,직렬,지역\n1조,홍길동,남,일반,서울\n1조,김영희,여,경채,대구\n2조,이철수,남,일반,부산`);
  assert(r.restoredGroups?.length === 2, 'R5-1: 2조');
}

console.log('\n========== R6. 순서 보존 ==========');
{
  const r = parseTextInput(`조\t이름\t성별\n1조\t가길동\t남\n1조\t나영희\t여\n1조\t다철수\t남\n2조\t라민수\t남\n2조\t마유진\t여`);
  assert(r.restoredGroups?.[0].members[0].name === '가길동', 'R6-1');
  assert(r.restoredGroups?.[0].members[2].name === '다철수', 'R6-2');
  assert(r.restoredGroups?.[1].members[1].name === '마유진', 'R6-3');
}

console.log('\n========== A1. 생년 변환 ==========');
{
  const y = new Date().getFullYear();
  const { members: ms } = parseTextInput(`이름\t성별\t나이\n홍길동\t남\t28\n김영희\t여\t1998\n이철수\t남\t${y-30}\n박민수\t남\t25`);
  assert(ms[0].age === 28, 'A1-1: 28');
  assert(ms[1].age === y - 1998, `A1-2: ${y-1998}`);
  assert(ms[2].age === 30, 'A1-3: 30');
  assert(ms[3].age === 25, 'A1-4: 25');
}

console.log('\n========== A2. 나이 키워드 ==========');
{
  for (const kw of ['나이','연령','age','생년','출생년도']) {
    const { members: ms } = parseTextInput(`이름\t성별\t${kw}\n홍길동\t남\t28`);
    assert(ms[0].age === 28, `A2: ${kw}`);
  }
}

console.log('\n========== A3. 나이 컬럼 없음 ==========');
{
  const { members: ms } = parseTextInput(`이름\t성별\t직렬\n홍길동\t남\t일반`);
  assert(ms[0].age === undefined, 'A3: undefined');
}

console.log('\n========== A4. 잘못된 나이 ==========');
{
  const { members: ms } = parseTextInput(`이름\t성별\t나이\n홍길동\t남\tabc\n김영희\t여\t-5\n이철수\t남\t0\n박민수\t남\t`);
  assert(ms[0].age === undefined, 'A4-1: abc');
  assert(ms[1].age === undefined, 'A4-2: -5');
  assert(ms[2].age === undefined, 'A4-3: 0');
  assert(ms[3].age === undefined, 'A4-4: empty');
}

console.log('\n========== F11. 10회 안정성 ==========');
{
  for (let run = 0; run < 10; run++) {
    const ms = [];
    for (let i = 0; i < 50; i++) ms.push(makeMember(i, { gender: i < 35 ? 'male' : 'female', age: 20 + (i%25), score: 180 + Math.random()*70, series: ['일반','경채','경행'][i%3] }));
    const { groups } = assignGroups(ms, baseSettings({ groupSize: { min: 5, max: 8 }, useScoreBalance: true, useAgeBalance: true }));
    const total = groups.reduce((s,g) => s + g.members.length, 0);
    assert(total === 50, `F11-${run+1}: 전원 (${total})`);
    const ids = new Set(); let dup = false;
    for (const g of groups) for (const m of g.members) { if (ids.has(m.id)) dup = true; ids.add(m.id); }
    assert(!dup, `F11-${run+1}: 중복 없음`);
  }
}

// ========================================
console.log(`\n${'='.repeat(60)}`);
console.log(`결과: ${passed} 통과 / ${failed} 실패 (총 ${passed + failed}개)`);
if (failed === 0) console.log('모든 테스트 통과!');
else process.exit(1);
