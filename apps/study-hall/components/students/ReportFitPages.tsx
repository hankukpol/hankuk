"use client";

import { useEffect } from "react";

const MM = 96 / 25.4; // CSS px per mm
const PAGE_MM = 297 - 12 - 14; // A4 세로에서 @page 위·아래 여백을 뺀 인쇄 높이
const SLACK = 0.94; // 쪽 넘김 때 통째로 넘기는 칸(break-inside: avoid)이 남기는 빈 줄 몫
const MIN_ZOOM = 0.72; // 이보다 작으면 종이에서 읽기 어렵다(8pt × 0.72 ≈ 5.8pt)

/**
 * 상담 자료를 정해진 쪽수(기본 2쪽) 안에 넣는다(운영자 요청 2026-10-07: 항상 2쪽).
 * 화면 A4 미리보기는 인쇄와 같은 글자·여백(globals.css)이라, 인쇄 직전에 화면 높이로 인쇄 높이를 잰다.
 * 넘치면 `--report-fit` 비율만큼 인쇄에서 줄인다(@media print 의 zoom). 화면 모양은 바꾸지 않는다.
 */
export function ReportFitPages({ selector = ".student-report", pages = 2 }: { selector?: string; pages?: number }) {
  useEffect(() => {
    const fit = () => {
      // 인쇄 화면으로 바뀐 뒤에는 다시 재지 않는다(이미 줄인 배율이 걸린 인쇄 레이아웃이라 값이 틀어진다).
      if (window.matchMedia("print").matches) return;
      const report = document.querySelector<HTMLElement>(selector);
      if (!report) return;
      const style = getComputedStyle(report);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const contentMm = (report.scrollHeight - padding) / MM;
      const budget = pages * PAGE_MM * SLACK;
      const zoom = contentMm > budget ? Math.max(MIN_ZOOM, budget / contentMm) : 1;
      report.style.setProperty("--report-fit", zoom.toFixed(3));
      report.dataset.reportFit = zoom.toFixed(3);
    };
    fit();
    window.addEventListener("beforeprint", fit);
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("resize", fit);
    };
  }, [selector, pages]);

  return null;
}
