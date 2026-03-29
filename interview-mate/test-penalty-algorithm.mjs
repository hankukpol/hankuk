import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const tempRoot = path.resolve('.tmp-study-group-tests');
fs.mkdirSync(tempRoot, { recursive: true });
for (const entry of fs.readdirSync(tempRoot)) {
  if (entry.startsWith('run-')) {
    fs.rmSync(path.join(tempRoot, entry), { recursive: true, force: true });
  }
}
const tempDir = fs.mkdtempSync(path.join(tempRoot, 'run-'));
const require = createRequire(import.meta.url);

process.on('exit', () => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  const remainingEntries = fs.existsSync(tempRoot) ? fs.readdirSync(tempRoot) : [];
  if (remainingEntries.length === 0) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

function transpile(relativePath) {
  const absolutePath = path.resolve(relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: path.basename(relativePath),
  });

  const outputPath = path.join(
    tempDir,
    relativePath.replace(/^src[\\/]/, '').replace(/\.ts$/, '.js')
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output.outputText, 'utf8');
  return outputPath;
}

const algorithmPath = transpile('src/lib/study-group/algorithm.ts');
const configPath = transpile('src/lib/study-group/config.ts');
const excelPath = transpile('src/lib/study-group/excel.ts');
transpile('src/lib/study-group/types.ts');

const {
  assignGroups,
  calcGroupPenalty,
  computeGlobalStats,
  getAgeBracket,
  isDaeguGyeongbuk,
  optimizeBySwap,
} = require(algorithmPath);
const { DEFAULT_PENALTY_WEIGHTS } = require(configPath);
const { parseTextInput } = require(excelPath);

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL ${label}`);
  }
}

function makeMember(id, overrides = {}) {
  return {
    id: `member-${id}`,
    name: `멤버${id}`,
    phone: `010-0000-${String(id).padStart(4, '0')}`,
    gender: 'male',
    series: '일반',
    region: '서울',
    ...overrides,
  };
}

function totalAssigned(groups) {
  return groups.reduce((sum, group) => sum + group.members.length, 0);
}

function hasDuplicateMembers(groups) {
  const ids = groups.flatMap((group) => group.members.map((member) => member.id));
  return ids.length !== new Set(ids).size;
}

console.log('\n[1] helper checks');
assert(getAgeBracket(24) === 'A', '24세는 A 구간');
assert(getAgeBracket(25) === 'B', '25세는 B 구간');
assert(getAgeBracket(28) === 'C', '28세는 C 구간');
assert(getAgeBracket(31) === 'D', '31세는 D 구간');
assert(getAgeBracket(undefined) === null, '나이 없으면 null');
assert(isDaeguGyeongbuk('대구 수성구'), '대구는 대경으로 분류');
assert(isDaeguGyeongbuk('경북 포항'), '경북은 대경으로 분류');
assert(!isDaeguGyeongbuk('서울'), '서울은 대경 아님');

console.log('\n[2] hard constraints');
{
  const members = [
    makeMember(1, { gender: 'male', preAssignedGroup: 1, series: '경채' }),
    makeMember(2, { gender: 'female', preAssignedGroup: 2, series: '경채' }),
    makeMember(3, { gender: 'male', series: '사이버' }),
    makeMember(4, { gender: 'female', series: '사이버' }),
    makeMember(5, { gender: 'male', series: '사이버' }),
    makeMember(6, { gender: 'female', series: '사이버' }),
    makeMember(7, { gender: 'male', series: '일반' }),
    makeMember(8, { gender: 'female', series: '일반' }),
    makeMember(9, { gender: 'male', series: '일반' }),
    makeMember(10, { gender: 'female', series: '일반' }),
    makeMember(11, { gender: 'male', series: '일반' }),
    makeMember(12, { gender: 'female', series: '일반' }),
  ];

  const result = assignGroups(members, {
    examType: 'police',
    groupSize: { min: 4, max: 4 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [{ id: 'rule-1', series: '사이버', countPerGroup: 1 }],
    usePreAssignment: true,
    penaltyWeights: { ...DEFAULT_PENALTY_WEIGHTS },
  });

  assert(result.groups[0].members.some((member) => member.id === 'member-1'), '사전 편성 1조 유지');
  assert(result.groups[1].members.some((member) => member.id === 'member-2'), '사전 편성 2조 유지');
  assert(
    result.groups.every(
      (group) =>
        group.members.filter((member) => member.series === '사이버').length >= 1
    ),
    '강제 배정 직렬 유지'
  );
  assert(result.lockedMemberIds?.length === 5, 'lockedMemberIds includes hard-constrained members');
  assert(totalAssigned(result.groups) === members.length, '전체 인원 누락 없음');
  assert(!hasDuplicateMembers(result.groups), '중복 배정 없음');
}

console.log('\n[3] penalty auto-zero checks');
{
  const members = Array.from({ length: 20 }, (_, index) =>
    makeMember(index + 1, {
      gender: index % 2 === 0 ? 'male' : 'female',
      region: index % 3 === 0 ? '대구' : '서울',
    })
  );

  const result = assignGroups(members, {
    examType: 'police',
    groupSize: { min: 4, max: 5 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: { ...DEFAULT_PENALTY_WEIGHTS },
  });

  assert(result.metrics?.penaltyBreakdown.ageBracket === 0, '나이 데이터 없으면 age penalty 0');
  assert(result.metrics?.penaltyBreakdown.score === 0, '성적 데이터 없으면 score penalty 0');
}

console.log('\n[4] swap optimization reduces penalty');
{
  const settings = {
    examType: 'police',
    groupSize: { min: 4, max: 4 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: { ...DEFAULT_PENALTY_WEIGHTS },
  };

  const groupA = {
    groupNumber: 1,
    members: [
      makeMember('a1', { gender: 'male', region: '대구', age: 31, score: 230, series: '일반' }),
      makeMember('a2', { gender: 'male', region: '경북', age: 30, score: 225, series: '일반' }),
      makeMember('a3', { gender: 'female', region: '대구', age: 29, score: 220, series: '일반' }),
      makeMember('a4', { gender: 'female', region: '경북', age: 28, score: 215, series: '일반' }),
    ],
  };
  const groupB = {
    groupNumber: 2,
    members: [
      makeMember('b1', { gender: 'male', region: '서울', age: 23, score: 180, series: '경채' }),
      makeMember('b2', { gender: 'male', region: '부산', age: 24, score: 185, series: '경채' }),
      makeMember('b3', { gender: 'female', region: '인천', age: 25, score: 190, series: '경채' }),
      makeMember('b4', { gender: 'female', region: '광주', age: 26, score: 195, series: '경채' }),
    ],
  };

  const groups = [
    { groupNumber: groupA.groupNumber, members: [...groupA.members] },
    { groupNumber: groupB.groupNumber, members: [...groupB.members] },
  ];
  const members = [...groups[0].members, ...groups[1].members];
  const stats = computeGlobalStats(members, groups.length, settings);
  const beforePenalty = groups.reduce(
    (sum, group) => sum + calcGroupPenalty(group, settings.penaltyWeights, stats),
    0
  );
  const optimizeResult = optimizeBySwap(
    groups,
    new Set(),
    settings.penaltyWeights,
    stats
  );
  const afterPenalty = groups.reduce(
    (sum, group) => sum + calcGroupPenalty(group, settings.penaltyWeights, stats),
    0
  );

  assert(optimizeResult.swapsPerformed > 0, '개선 스왑 발생');
  assert(afterPenalty < beforePenalty, '스왑 최적화로 페널티 감소');
}

console.log('\n[5] restore parsing');
{
  const parsed = parseTextInput(`조\t이름\t성별\t직렬\t지역\t나이\t필기성적
1조\t홍길동\t남\t일반\t대구\t28\t201.5
1조\t김영희\t여\t경채\t서울\t25\t199.0
2조\t박민수\t남\t사이버\t경북\t31\t205.0`);

  assert(parsed.restoredGroups?.length === 2, '복원 모드 감지');
  assert(parsed.members[0].age === 28, '나이 파싱 유지');
  assert(parsed.members[0].score === 201.5, '성적 파싱 유지');
}

console.log('\n[6] partial score coverage penalty');
{
  const settings = {
    examType: 'police',
    groupSize: { min: 4, max: 4 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: { ...DEFAULT_PENALTY_WEIGHTS },
  };

  const groups = [
    {
      groupNumber: 1,
      members: [
        makeMember('c1', { gender: 'male' }),
        makeMember('c2', { gender: 'male' }),
        makeMember('c3', { gender: 'female' }),
        makeMember('c4', { gender: 'female' }),
      ],
    },
    {
      groupNumber: 2,
      members: [
        makeMember('d1', { gender: 'male', score: 200 }),
        makeMember('d2', { gender: 'male', score: 202 }),
        makeMember('d3', { gender: 'female', score: 204 }),
        makeMember('d4', { gender: 'female', score: 206 }),
      ],
    },
  ];

  const stats = computeGlobalStats(
    [...groups[0].members, ...groups[1].members],
    groups.length,
    settings
  );

  assert(
    calcGroupPenalty(groups[0], settings.penaltyWeights, stats) > 0,
    '점수 없는 조도 score penalty가 0이 아님'
  );
}

console.log('\n[7] performance smoke');
{
  const policeSeries = ['일반', '경채', '101경비단', '경행', '법무회계', '사이버', '인사'];
  const regions = ['대구', '경북', '서울', '부산', '인천'];
  const members = Array.from({ length: 300 }, (_, index) =>
    makeMember(index + 1, {
      gender: index < 220 ? 'male' : 'female',
      series: policeSeries[index % policeSeries.length],
      region: index < 220 ? regions[index % 2] : regions[(index % 3) + 2],
      age: 20 + (index % 13),
      score: 180 + (index % 40) * 1.2,
    })
  );

  const startedAt = performance.now();
  const result = assignGroups(members, {
    examType: 'police',
    groupSize: { min: 8, max: 10 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [{ id: 'rule-1', series: '101경비단', countPerGroup: 1 }],
    usePreAssignment: true,
    penaltyWeights: { ...DEFAULT_PENALTY_WEIGHTS },
  });
  const elapsed = performance.now() - startedAt;

  console.log(`elapsed_ms=${elapsed.toFixed(2)}`);
  assert(totalAssigned(result.groups) === members.length, '300명 전체 배정');
  assert(!hasDuplicateMembers(result.groups), '300명 중복 배정 없음');
  assert(elapsed < 5000, '300명 배정 5초 이내');
}

console.log('\n[8] region distribution - police (per-region)');
{
  // 경찰: 대구 40명, 경북 30명, 서울 10명, 부산 10명 = 90명, 10조
  // idealMax: 대구=4, 경북=3, 서울=1, 부산=1
  const members = [];
  let id = 0;
  for (let i = 0; i < 40; i++) {
    members.push(makeMember(++id, { gender: i < 30 ? 'male' : 'female', region: '대구', series: '일반', age: 22 + (i % 10) }));
  }
  for (let i = 0; i < 30; i++) {
    members.push(makeMember(++id, { gender: i < 22 ? 'male' : 'female', region: '경북', series: '경채', age: 23 + (i % 9) }));
  }
  for (let i = 0; i < 10; i++) {
    members.push(makeMember(++id, { gender: i < 8 ? 'male' : 'female', region: '서울', series: '사이버', age: 24 + (i % 8) }));
  }
  for (let i = 0; i < 10; i++) {
    members.push(makeMember(++id, { gender: i < 8 ? 'male' : 'female', region: '부산', series: '일반', age: 25 + (i % 7) }));
  }

  const result = assignGroups(members, {
    examType: 'police',
    groupSize: { min: 8, max: 10 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: { ...DEFAULT_PENALTY_WEIGHTS },
  });

  assert(totalAssigned(result.groups) === members.length, '90명 전체 배정 (경찰)');
  assert(!hasDuplicateMembers(result.groups), '중복 배정 없음 (경찰)');

  // 대구 idealMax = ceil(40/9) = 5, 경북 idealMax = ceil(30/9) = 4
  // Check no group has extreme concentration
  const maxDaeguInGroup = Math.max(...result.groups.map(g =>
    g.members.filter(m => m.region === '대구').length
  ));
  const maxGyeongbukInGroup = Math.max(...result.groups.map(g =>
    g.members.filter(m => m.region === '경북').length
  ));
  console.log(`  max 대구/조: ${maxDaeguInGroup}, max 경북/조: ${maxGyeongbukInGroup}`);
  assert(maxDaeguInGroup <= 6, '경찰: 대구 조당 6명 이하');
  assert(maxGyeongbukInGroup <= 5, '경찰: 경북 조당 5명 이하');
}

console.log('\n[9] region distribution - fire (per-region+gender)');
{
  // 소방: 대구남 40명, 대구여 10명, 경북남 30명, 경북여 8명, 서울남 5명, 서울여 7명 = 100명
  // 10조, idealMax: 대구남=4, 대구여=1, 경북남=3, 경북여=1
  const members = [];
  let id = 0;
  for (let i = 0; i < 40; i++) {
    members.push(makeMember(++id, { gender: 'male', region: '대구', series: '공채', age: 22 + (i % 10) }));
  }
  for (let i = 0; i < 10; i++) {
    members.push(makeMember(++id, { gender: 'female', region: '대구', series: '구급', age: 23 + (i % 8) }));
  }
  for (let i = 0; i < 30; i++) {
    members.push(makeMember(++id, { gender: 'male', region: '경북', series: '구조', age: 24 + (i % 9) }));
  }
  for (let i = 0; i < 8; i++) {
    members.push(makeMember(++id, { gender: 'female', region: '경북', series: '공채', age: 25 + (i % 7) }));
  }
  for (let i = 0; i < 5; i++) {
    members.push(makeMember(++id, { gender: 'male', region: '서울', series: '공채', age: 26 + (i % 5) }));
  }
  for (let i = 0; i < 7; i++) {
    members.push(makeMember(++id, { gender: 'female', region: '서울', series: '구급', age: 27 + (i % 5) }));
  }

  const result = assignGroups(members, {
    examType: 'fire',
    groupSize: { min: 8, max: 10 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: { ...DEFAULT_PENALTY_WEIGHTS },
  });

  assert(totalAssigned(result.groups) === members.length, '100명 전체 배정 (소방)');
  assert(!hasDuplicateMembers(result.groups), '중복 배정 없음 (소방)');

  // 소방에서 핵심: 같은 지역+같은 성별이 한 조에 과도하게 몰리지 않아야 함
  // 대구남 idealMax = ceil(40/10) = 4, 경북남 idealMax = ceil(30/10) = 3
  const maxDaeguMaleInGroup = Math.max(...result.groups.map(g =>
    g.members.filter(m => m.region === '대구' && m.gender === 'male').length
  ));
  const maxGyeongbukMaleInGroup = Math.max(...result.groups.map(g =>
    g.members.filter(m => m.region === '경북' && m.gender === 'male').length
  ));
  console.log(`  max 대구남/조: ${maxDaeguMaleInGroup}, max 경북남/조: ${maxGyeongbukMaleInGroup}`);
  assert(maxDaeguMaleInGroup <= 6, '소방: 대구 남성 조당 6명 이하');
  assert(maxGyeongbukMaleInGroup <= 5, '소방: 경북 남성 조당 5명 이하');

  // 소방에서 대구 남+여는 함께 있어도 OK (경쟁자 아님)
  // 대구 총인원(남+여)은 조당 많아도 괜찮음 - 성별이 다르면 페널티 없음
}

console.log('\n[10] fire vs police region penalty difference');
{
  // 같은 멤버를 fire와 police로 편성했을 때 페널티 계산이 다른지 확인
  const group = {
    groupNumber: 1,
    members: [
      makeMember(1, { gender: 'male', region: '대구' }),
      makeMember(2, { gender: 'male', region: '대구' }),
      makeMember(3, { gender: 'male', region: '대구' }),
      makeMember(4, { gender: 'female', region: '대구' }),
      makeMember(5, { gender: 'female', region: '대구' }),
    ],
  };

  const regionOnlyWeights = { gender: 0, ageBracket: 0, region: 4.0, series: 0, score: 0 };

  // 경찰: 대구 5명 전부 동일 지역 → 높은 페널티
  const policeStats = computeGlobalStats(group.members, 1, {
    examType: 'police',
    groupSize: { min: 5, max: 5 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: regionOnlyWeights,
  });
  const policePenalty = calcGroupPenalty(group, regionOnlyWeights, policeStats);

  // 소방: 대구남 3명 + 대구여 2명 → 성별이 다르니 각각 페널티
  const fireStats = computeGlobalStats(group.members, 1, {
    examType: 'fire',
    groupSize: { min: 5, max: 5 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: regionOnlyWeights,
  });
  const firePenalty = calcGroupPenalty(group, regionOnlyWeights, fireStats);

  console.log(`  police penalty: ${policePenalty}, fire penalty: ${firePenalty}`);

  // 1조에 전체 인원이 들어가므로 idealMax가 전체 인원과 같아져 penalty = 0
  // 대신 2개 조로 분할된 케이스를 테스트
  const group1 = {
    groupNumber: 1,
    members: [
      makeMember(1, { gender: 'male', region: '대구' }),
      makeMember(2, { gender: 'male', region: '대구' }),
      makeMember(3, { gender: 'male', region: '대구' }),
      makeMember(4, { gender: 'female', region: '대구' }),
    ],
  };
  const group2 = {
    groupNumber: 2,
    members: [
      makeMember(5, { gender: 'male', region: '서울' }),
      makeMember(6, { gender: 'female', region: '서울' }),
      makeMember(7, { gender: 'male', region: '서울' }),
      makeMember(8, { gender: 'female', region: '서울' }),
    ],
  };
  const allMembers = [...group1.members, ...group2.members];

  const policeStats2 = computeGlobalStats(allMembers, 2, {
    examType: 'police',
    groupSize: { min: 4, max: 4 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: regionOnlyWeights,
  });
  const fireStats2 = computeGlobalStats(allMembers, 2, {
    examType: 'fire',
    groupSize: { min: 4, max: 4 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: regionOnlyWeights,
  });

  const policeP1 = calcGroupPenalty(group1, regionOnlyWeights, policeStats2);
  const fireP1 = calcGroupPenalty(group1, regionOnlyWeights, fireStats2);
  console.log(`  2-group test: police group1=${policeP1.toFixed(2)}, fire group1=${fireP1.toFixed(2)}`);

  // 경찰: 대구 4명, idealMax=ceil(4/2)=2, excess=2, penalty=(2)^2*4=16
  // 소방: 대구남 3명 idealMax=ceil(3/2)=2 excess=1 penalty=1*4=4
  //       대구여 1명 idealMax=ceil(1/2)=1 excess=0 penalty=0
  //       총 fire penalty = 4
  // 소방이 경찰보다 페널티가 낮아야 함 (같은 지역이라도 성별이 다르면 OK)
  assert(fireP1 < policeP1, '소방은 같은 지역 다른 성별에 대해 더 관대');
}

// ---------- [11] pair-required series (singleton prevention) ----------
{
  console.log('\n[11] pair-required series (singleton prevention)');

  // 100명: 구급 5명, 나머지 공채 95명, 소방 10조
  const members = [];
  for (let i = 1; i <= 5; i++) {
    members.push(makeMember(i, { series: '구급', gender: 'male', region: '대구' }));
  }
  for (let i = 6; i <= 100; i++) {
    members.push(makeMember(i, {
      series: '공채',
      gender: i % 4 === 0 ? 'female' : 'male',
      region: i % 3 === 0 ? '대구' : i % 3 === 1 ? '경북' : '서울',
    }));
  }

  const result = assignGroups(members, {
    examType: 'fire',
    groupSize: { min: 8, max: 12 },
    genderRatio: { mode: 'auto' },
    forceAssignRules: [],
    usePreAssignment: false,
    penaltyWeights: { gender: 2.5, ageBracket: 2.0, region: 4.0, series: 1.0, score: 1.5 },
    pairRequiredSeries: ['구급'],
  });

  assert(result.groups.length > 0, '조 편성 완료');

  const allIds = result.groups.flatMap((g) => g.members.map((m) => m.id));
  assert(allIds.length === 100, '전체 인원 배정');
  assert(new Set(allIds).size === 100, '중복 배정 없음');

  let singletonFound = false;
  for (const group of result.groups) {
    const gugeupCount = group.members.filter((m) => m.series === '구급').length;
    if (gugeupCount === 1) {
      singletonFound = true;
      console.log(`  WARNING: ${group.groupNumber}조에 구급 1명 단독 배치`);
    }
  }
  assert(!singletonFound, '구급 직렬 단독 배치 없음 (0명 또는 2명 이상)');

  // 구급 분포 출력
  const dist = result.groups.map(
    (g) => `${g.groupNumber}조:${g.members.filter((m) => m.series === '구급').length}`
  );
  console.log(`  구급 분포: ${dist.join(', ')}`);
}

console.log(`\nresult: ${passed} passed / ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
