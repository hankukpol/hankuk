import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = ".superloopy/evidence/frontend/2026-09-08-workflow-tabs";
const sources = ["production", "recheck", "final"];
const groups = new Map();
for (const source of sources) {
  const file = path.join(root, source, "audit.json");
  if (!fs.existsSync(file)) continue;
  const localGroups = new Map();
  for (const item of JSON.parse(fs.readFileSync(file, "utf8"))) {
    const key = `${item.route}|${item.width}`;
    if (!localGroups.has(key)) localGroups.set(key, []);
    localGroups.get(key).push({ ...item, evidenceSource: source });
  }
  for (const [key, items] of localGroups) groups.set(key, items);
}
const results = [...groups.values()].flat();
const routes = [...new Set(results.map((item) => item.route))].sort();
const issues = results.flatMap((item) => item.issues.map((issue) => ({ route: item.route, width: item.width, state: item.state, ...issue })));
const errors = results.flatMap((item) => item.errors);
for (const route of routes) {
  assert.deepEqual([...new Set(results.filter((item) => item.route === route).map((item) => item.width))].sort((a, b) => a - b), [390, 768, 1280, 1600]);
}
assert.equal(issues.length, 0, "Visual findings remain");
assert.equal(errors.length, 0, "Browser errors remain");
function decision(route) {
  if (route.includes("management-policy")) return "기존 유지; mock 정책 부재로 안내 화면만 확인";
  if (route.includes("/students/student-")) return "상세 탭 유지; 성적 탭의 중첩 카드 제거";
  if (route.includes("/admin/points")) return "부여 내역/학생별 순위 탭; 모바일 기록 카드";
  if (route.endsWith("/admin/leave")) return "내역/학생별 사용 현황/미사용 정산 탭";
  if (route.endsWith("/admin/interviews")) return "면담 이력/권장 대상 탭; 내용별 기록 카드";
  if (route.endsWith("/admin/payments")) return "월별 현황/수납 내역/일일 정산 탭; 모바일 카드";
  if (route.endsWith("/admin/phone-submissions")) return "교시별 체크/이력 조회 탭";
  if (route.endsWith("/admin/exams")) return "상위 시험 구분 유지; 아침 모의고사 일일/주간 서브 탭";
  if (route.endsWith("/super-admin/manage")) return "지점/운영 계정 서브 탭; 독립 기록 카드";
  if (route.includes("/settings")) return "연관된 설정 목록/편집 흐름 유지; 탭과 모달 점검";
  if (route.includes("/student")) return "학생용 카드 또는 명단/상세 흐름 유지";
  if (route.includes("/assistant")) return "현장 출결 흐름 유지; 모바일 조작 점검";
  return "조회/비교/입력이 연관된 기존 구성 유지; 반응형과 연결 상태 점검";
}
const inventory = ["# 페이지별 UI 점검", "", `생성 결과: ${routes.length}개 경로, ${groups.size}개 경로/폭 조합, ${results.length}개 화면 상태.`, "", "각 경로를 390 / 768 / 1280 / 1600px에서 확인했습니다. 동일 경로/폭의 재검사는 이전 결과 전체를 대체하며, 원본 증거는 별도 폴더에 유지합니다.", "", "| 경로 | 상태 수 | 구성 판단 |", "| --- | ---: | --- |"];
for (const route of routes) inventory.push(`| \`${route}\` | ${results.filter((item) => item.route === route).length} | ${decision(route)} |`);
fs.writeFileSync(path.join(root, "PAGE_INVENTORY.md"), inventory.join("\n") + "\n");
const summary = { routes: routes.length, viewportPairs: groups.size, states: results.length, issues: issues.length, browserErrors: errors.length, sources, routeList: routes };
fs.writeFileSync(path.join(root, "SUMMARY.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(root, "combined-audit.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(summary, null, 2));
