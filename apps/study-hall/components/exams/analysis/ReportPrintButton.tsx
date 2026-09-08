"use client";

import { useRef, useState } from "react";

/** Copies only the selected report; no API or student data is sent elsewhere. */
export function ReportPrintButton() {
  const anchor = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  function openPrint() {
    const source = anchor.current?.parentElement;
    if (!source) return;
    const popup = window.open("", "_blank", "width=960,height=900");
    if (!popup) { setError("팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러주세요."); return; }
    try {
      const doc = popup.document;
      doc.documentElement.lang = "ko";
      doc.title = source.querySelector("header")?.textContent?.trim() || "개인 성적 분석";
      const computed = getComputedStyle(source);
      for (const property of Array.from(computed)) {
        if (property.startsWith("--admin-")) doc.documentElement.style.setProperty(property, computed.getPropertyValue(property));
      }
      const style = doc.createElement("style");
      style.textContent = `
        @page { size: A4 portrait; margin: 12mm; }
        * { box-sizing: border-box; }
        body { margin: 0 auto; max-width: 186mm; padding: 0; color: #0a0a0a; background: white; font: 10pt/1.5 Arial, "Malgun Gothic", sans-serif; }
        h2 { font-size: 14pt; margin: 6mm 0 3mm; break-after: avoid; }
        h3 { font-size: 11pt; break-after: avoid; }
        p { margin: 2mm 0; }
        section { margin: 4mm 0; }
        table { width: 100% !important; min-width: 0 !important; table-layout: fixed; border-collapse: collapse; font-size: 8pt; }
        th, td { border: 1px solid #dddddd; padding: 1.5mm 1mm; white-space: normal !important; overflow-wrap: anywhere; text-align: center; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        th { background: #f3f3f5; }
        .admin-table-frame, details { overflow: visible !important; height: auto !important; max-height: none !important; }
        svg, img { max-width: 100%; height: auto; break-inside: avoid; }
        .recharts-responsive-container, .recharts-wrapper { height: auto !important; min-height: 0 !important; }
        .recharts-legend-wrapper { position: static !important; width: auto !important; }
        .recharts-tooltip-wrapper { display: none !important; }
        .recharts-wrapper { max-width: 100%; break-inside: avoid; }
        .admin-metric-strip { display: flex; flex-wrap: wrap; gap: 4mm; margin: 4mm 0; }
        .admin-metric-box { min-width: 25%; }
        .admin-metric-box-value { font-weight: bold; }
        summary { font-weight: bold; margin: 3mm 0; }
        button, select, input, [data-report-print] { display: none !important; }
        .print-actions { padding: 4mm 0; }
        .print-actions button { display: inline-block !important; padding: 3mm; cursor: pointer; }
        @media print { .print-actions { display: none !important; } body { max-width: none; } }
      `;
      doc.head.append(style);
      const actions = doc.createElement("div");
      actions.className = "print-actions";
      const help = doc.createElement("p");
      help.textContent = "A4 세로 · 인쇄 대상에서 프린터 또는 ‘PDF로 저장’을 선택하세요. 브라우저 머리글/바닥글은 끄는 것을 권장합니다.";
      const button = doc.createElement("button");
      button.textContent = "인쇄 / PDF 저장";
      button.onclick = async () => {
        await Promise.all(Array.from(doc.images).map(image => image.decode().catch(() => undefined)));
        await doc.fonts.ready;
        popup.print();
      };
      actions.append(help, button);
      const copy = source.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("[data-report-print], script").forEach(node => node.remove());
      copy.querySelectorAll("details").forEach(node => { node.open = true; });
      const originals = source.querySelectorAll('svg.recharts-surface[role="application"]');
      copy.querySelectorAll('svg.recharts-surface[role="application"]').forEach((node, index) => {
        const original = originals[index];
        if (!original) return;
        const snapshot = original.cloneNode(true) as SVGSVGElement;
        const originalNodes = [original, ...Array.from(original.querySelectorAll("*"))];
        const clonedNodes = [snapshot, ...Array.from(snapshot.querySelectorAll("*"))];
        clonedNodes.forEach((element, i) => {
          const styles = getComputedStyle(originalNodes[i]);
          for (const property of ["fill", "stroke", "stroke-width", "font-size", "font-family", "font-weight", "opacity"]) {
            (element as SVGElement).style.setProperty(property, styles.getPropertyValue(property));
          }
        });
        const image = doc.createElement("img");
        image.alt = original.closest('[role="img"]')?.getAttribute("aria-label") || "성적 추이 차트";
        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(snapshot));
        const chart = node.closest(".recharts-responsive-container") || node;
        const figure = doc.createElement("figure");
        figure.style.margin = "4mm 0";
        figure.style.breakInside = "avoid";
        image.style.width = "100%";
        image.style.display = "block";
        figure.append(image);
        const legend = chart.querySelector(".recharts-legend-wrapper");
        if (legend) {
          const caption = doc.createElement("figcaption");
          caption.textContent = Array.from(legend.querySelectorAll(".recharts-legend-item-text")).map(item => item.textContent).join(" · ");
          figure.append(caption);
        }
        chart.replaceWith(figure);
      });
      doc.body.append(actions, copy);
      popup.opener = null;
      popup.focus();
      setError("");
    } catch {
      popup.close();
      setError("인쇄 화면을 준비하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  }
  return <div ref={anchor} data-report-print>
    <button type="button" className="admin-button-secondary" onClick={openPrint}>A4 인쇄 / PDF 저장</button>
    {error && <p role="alert" className="admin-help">{error}</p>}
  </div>;
}
