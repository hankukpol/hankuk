import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getStudentStatusClasses, getStudentStatusToneClass, getWarningStage, getWarningStageClasses, getWarningStageToneClass } from "../../lib/student-meta";
import { getInterviewResultTypeClasses } from "../../lib/interview-meta";
import { getAttendanceStatusClasses } from "../../lib/attendance-meta";

const stages = { WARNING_1: "1", WARNING_2: "2", INTERVIEW: "interview", WITHDRAWAL: "withdraw" } as const;

test("warning badges and interview results share stage-specific tokens", () => {
  for (const [stage, token] of Object.entries(stages)) {
    const expected = `border-warn-${token}-line bg-warn-${token}-soft text-warn-${token}`;
    assert.equal(getWarningStageClasses(stage), expected);
    assert.equal(getInterviewResultTypeClasses(stage), expected);
    assert.equal(getWarningStageToneClass(stage), `text-warn-${token}`);
  }
});

test("every warning color has matching hex and RGB values and readable text", () => {
  const css = fs.readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const read = (name: string) => {
    const hex = css.match(new RegExp(`--admin-${name}: #([0-9a-f]{6});`))?.[1];
    assert.ok(hex, name);
    const values = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    assert.ok(css.includes(`--admin-${name}-rgb: ${values.join(" ")};`), name);
    return values;
  };
  const luminance = (rgb: number[]) => rgb.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  for (const token of Object.values(stages)) {
    const ink = read(`warn-${token}`);
    const background = read(`warn-${token}-soft`);
    read(`warn-${token}-line`);
    assert.ok((luminance(background) + 0.05) / (luminance(ink) + 0.05) >= 4.5, token);
  }
});

test("graduated state is neutral while academy thresholds still determine warning stages", () => {
  assert.equal(getStudentStatusToneClass("GRADUATED"), "text-admin-text-secondary");
  assert.equal(getStudentStatusClasses("GRADUATED"), "border-admin-line bg-admin-surface-muted text-admin-text-secondary");
  assert.equal(getWarningStage(15, { warnLevel1: 10, warnLevel2: 20, warnInterview: 30, warnWithdraw: 40 }), "WARNING_1");
  assert.equal(getWarningStage(15, { warnLevel1: 20, warnLevel2: 30, warnInterview: 40, warnWithdraw: 50 }), "NORMAL");
});

test("attendance colors do not depend on academy accent aliases", () => {
  for (const [status, token] of Object.entries({ PRESENT: "present", TARDY: "tardy", ABSENT: "absent", EXCUSED: "excused" })) {
    assert.ok(getAttendanceStatusClasses(status).includes(`text-attend-${token}`));
    assert.doesNotMatch(getAttendanceStatusClasses(status), /(?:blue|sky|indigo)-/);
  }
});
