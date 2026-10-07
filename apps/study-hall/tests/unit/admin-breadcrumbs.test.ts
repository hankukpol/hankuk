import assert from "node:assert/strict";
import test from "node:test";

import { breadcrumbSteps } from "../../lib/admin-breadcrumbs";

test("메뉴 첫 화면은 하위 단계가 없다", () => {
  assert.deepEqual(breadcrumbSteps("students"), []);
  assert.deepEqual(breadcrumbSteps(""), []);
  assert.deepEqual(breadcrumbSteps("interviews"), []);
});

test("학생 하위 화면은 학생 상세를 거쳐 내려간다", () => {
  assert.deepEqual(breadcrumbSteps("students/abc"), [{ label: "학생 상세" }]);
  assert.deepEqual(breadcrumbSteps("/students/abc/report/"), [{ label: "학생 상세", href: "students/abc" }, { label: "상담 자료" }]);
  assert.deepEqual(breadcrumbSteps("students/abc/interviews"), [{ label: "학생 상세", href: "students/abc" }, { label: "면담 일지" }]);
  assert.deepEqual(breadcrumbSteps("students/new"), [{ label: "학생 등록" }]);
});

test("설정 경로 탭은 다른 경로에 있어도 탭 이름으로 보인다", () => {
  assert.deepEqual(breadcrumbSteps("settings/periods"), [{ label: "교시" }]);
  assert.deepEqual(breadcrumbSteps("points/rules"), [{ label: "상벌점 규칙" }]);
  assert.deepEqual(breadcrumbSteps("staff"), [{ label: "직원" }]);
  assert.deepEqual(breadcrumbSteps("settings/rules/arrivals"), [{ label: "운영 규칙", href: "settings/rules" }, { label: "등원 설정" }]);
  assert.deepEqual(breadcrumbSteps("settings/unknown"), []);
});

test("시험 성적 하위 화면", () => {
  assert.deepEqual(breadcrumbSteps("exams"), [{ label: "성적 입력" }]);
  assert.deepEqual(breadcrumbSteps("exams/analysis"), [{ label: "성적 분석" }]);
  assert.deepEqual(breadcrumbSteps("exams/students/s1"), [{ label: "성적 분석", href: "exams/analysis" }, { label: "개인 분석" }]);
  assert.deepEqual(breadcrumbSteps("exams/preview/learning"), [{ label: "성적 분석 기준" }]);
  assert.deepEqual(breadcrumbSteps("settings/exam-analysis"), [{ label: "성적 분석 기준" }]);
  assert.deepEqual(breadcrumbSteps("attendance/import"), [{ label: "누적시험 응시 여부 가져오기" }]);
});
