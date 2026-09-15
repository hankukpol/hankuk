import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../..");

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("settings pages use the shared route tab workspace", () => {
  const shell = source("components/settings/SettingsPageShell.tsx");

  assert.match(shell, /SettingsRouteTabs/);
  assert.match(shell, /className="admin-tabs"/);
  assert.match(shell, /aria-current=/);

  for (const route of [
    "general",
    "features",
    "periods",
    "rules",
    "tuition",
    "seats",
    "exams",
    "exam-schedules",
  ]) {
    assert.match(
      source(`app/[division]/admin/settings/${route}/page.tsx`),
      /SettingsPageShell/,
      `${route} 설정 화면이 공통 탭 셸을 사용해야 합니다.`,
    );
  }
  assert.match(source("app/[division]/admin/staff/page.tsx"), /SettingsPageShell/);
});

test("large settings workspaces are single-column tab panels", () => {
  const cases = [
    ["components/settings/GeneralSettingsManager.tsx", ["현재 설정", "기본 정보 편집"]],
    ["components/settings/FeatureSettingsManager.tsx", ["사용 현황", "기능 선택"]],
    ["components/periods/PeriodSettingsManager.tsx", ["교시 목록", "선택자습 신청"]],
    ["components/seats/SeatEditor.tsx", ["자습실 목록", "좌석 배치"]],
  ] as const;

  for (const [file, labels] of cases) {
    const code = source(file);
    assert.match(code, /AdminTabs/);
    assert.match(code, /AdminTabPanel/);
    assert.doesNotMatch(code, /xl:grid-cols-\[/, `${file}에 큰 화면 분할 열이 남아 있습니다.`);
    for (const label of labels) assert.ok(code.includes(label), `${file}에 ${label} 탭이 없습니다.`);
  }
});

test("row-level setting editors use right-side drawers", () => {
  for (const file of [
    "components/settings/TuitionPlanManager.tsx",
    "components/periods/PeriodSettingsManager.tsx",
    "components/admin/StaffManager.tsx",
    "components/exams/ExamTypeManager.tsx",
    "components/exam-schedules/ExamScheduleManager.tsx",
    "components/seats/SeatEditor.tsx",
  ]) {
    const code = source(file);
    assert.match(code, /SlideOver/);
    assert.match(code, /DialogActions/);
  }
});

test("rule settings split the long form into operational tabs", () => {
  const code = source("components/settings/RulesSettingsManager.tsx");

  assert.match(code, /AdminTabs/);
  assert.match(code, /AdminTabPanel/);
  assert.doesNotMatch(code, /xl:grid-cols-\[/);
  for (const label of [
    "운영 요약",
    "출결·경고",
    "휴가·개근",
    "문자·알림",
    "성적 분석",
    "자동 상벌점",
    "변경 이력",
  ]) {
    assert.ok(code.includes(label), `${label} 탭이 없습니다.`);
  }
});
