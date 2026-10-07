"use client";

import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { getKstTodayYmd } from "@/lib/date-utils";
import type { PreviewData } from "@/lib/exam-preview/types";
import { ScorePrintSheet, type ScorePrintHeadline } from "./ScorePrintSheet";

/**
 * 성적표 인쇄. 화면을 새 창으로 복사하던 방식(안내 문구·버튼이 있는 중간 창)을 버리고,
 * 인쇄 전용 표 서식(ScorePrintSheet)을 문서 끝에 그린 뒤 바로 인쇄 창을 연다(운영자 요청 2026-10-07).
 * 화면에서는 서식이 보이지 않는다. 인쇄할 때만 html[data-print-sheet] 규칙이 나머지 화면을 숨긴다(globals.css).
 */
export function ScorePrintButton({ data, mode, headline }: { data: PreviewData; mode: "admin" | "student"; headline?: ScorePrintHeadline | null }) {
  // 한 번 그린 서식은 그대로 둔다. 인쇄 창이 비동기인 브라우저(휴대폰)에서 인쇄 도중 서식이 사라지지 않게 하기 위해서다.
  const [request, setRequest] = useState(0);

  useEffect(() => {
    if (!request) return;
    const root = document.documentElement;
    const finish = () => { delete root.dataset.printSheet; };
    root.dataset.printSheet = "score";
    window.addEventListener("afterprint", finish, { once: true });
    // 서식 표가 그려진 다음 프레임에 인쇄 창을 연다.
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", finish);
      finish();
    };
  }, [request]);

  return (
    <>
      <button type="button" className="admin-button" onClick={() => setRequest((value) => value + 1)}>
        <Printer className="h-4 w-4" aria-hidden="true" />
        {/* 관리자 화면에는 상담 자료(면담용)와 나란히 있으므로 누구에게 주는 종이인지 적는다. */}
        {mode === "admin" ? "성적표 인쇄 (학생용)" : "성적표 인쇄"}
      </button>
      {request
        ? createPortal(
            <div className="print-sheet-root">
              <ScorePrintSheet data={data} mode={mode} today={getKstTodayYmd()} headline={headline} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
