/** Reshapes the detached print copy only; live controls and report values stay intact. */
export function formatPrintDocument(copy: HTMLElement, doc: Document) {
  copy.classList.add("report-document");
  const header = copy.querySelector("header");
  if (header) copy.prepend(header);
  copy.querySelectorAll<HTMLElement>("[role=tabpanel]").forEach(panel => {
    panel.removeAttribute("role");
    panel.removeAttribute("aria-labelledby");
  });
  for (const strip of Array.from(copy.querySelectorAll(".admin-metric-strip"))) {
    const boxes = Array.from(strip.querySelectorAll(":scope > .admin-metric-box"));
    if (!boxes.length) continue;
    const table = doc.createElement("table");
    table.className = "report-summary-table";
    const caption = table.createCaption();
    caption.textContent = strip.getAttribute("data-report-section") === "overview" ? "성적 요약" : "주요 지표";
    const body = table.createTBody();
    for (let index = 0; index < boxes.length; index += 2) {
      const row = body.insertRow();
      for (const box of boxes.slice(index, index + 2)) {
        const label = doc.createElement("th");
        label.scope = "row";
        label.textContent = box.querySelector(".admin-metric-box-label")?.textContent ?? "";
        const value = doc.createElement("td");
        value.textContent = box.querySelector(".admin-metric-box-value")?.textContent ?? "";
        row.append(label, value);
      }
      if (row.cells.length === 2) row.cells[1].colSpan = 3;
    }
    strip.replaceWith(table);
  }
  for (const list of Array.from(copy.querySelectorAll("dl.paper-review-answers"))) {
    const table = doc.createElement("table");
    table.className = "report-detail-table";
    const body = table.createTBody();
    for (const term of Array.from(list.querySelectorAll("dt"))) {
      const definition = term.nextElementSibling;
      if (definition?.tagName !== "DD") continue;
      const row = body.insertRow();
      const label = doc.createElement("th");
      label.scope = "row";
      label.textContent = term.textContent;
      const value = row.insertCell();
      value.append(...Array.from(definition.childNodes));
      row.prepend(label);
    }
    if (body.rows.length) list.replaceWith(table);
  }
}

export const reportDocumentStyle = `
  .report-document { width: 100%; min-width: 0; }
  .report-document > header { border-bottom: 2px solid var(--admin-text); padding-bottom: 3mm; margin-bottom: 4mm; }
  .report-document > header h2 { margin-top: 0; }
  .report-document header p { color: var(--admin-text-secondary); }
  .report-document [data-report-panel], .report-document .admin-flat-page { display: block; width: 100%; }
  .report-document h2, .report-document caption { text-align: left; font-size: 14pt; font-weight: 700; margin: 4mm 0 2mm; break-after: avoid; }
  .report-document h3 { padding: 2mm 0; border-bottom: 1px solid var(--admin-grid); }
  .report-document h4 { margin: 3mm 0 2mm; font-size: 10pt; }
  .paper-review-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2mm; }
  .report-document table { margin: 2mm 0 4mm; }
  .report-summary-table th { width: 22%; }
  .report-summary-table td { font-size: 10pt; font-weight: 600; }
  .report-detail-table th { width: 30%; }
  .report-detail-table td { text-align: left; }
  .report-document .admin-notice, .report-document .admin-empty-state { padding: 2mm 0; border-bottom: 1px solid var(--admin-grid); }
  .report-document .admin-help { color: var(--admin-text-secondary); }
  .report-document figure img { object-fit: contain; max-height: 80mm; }
  .report-document ul { padding-left: 5mm; }
  .report-document [data-paper-review] { break-inside: avoid; }
  @media screen {
    html { background: var(--admin-surface-muted); }
    body { max-width: 210mm; padding: 0 12mm 12mm; background: var(--admin-surface); }
    .print-actions { position: sticky; top: 0; background: var(--admin-surface); border-bottom: 1px solid var(--admin-grid); margin-bottom: 4mm; z-index: 1; }
    .print-actions button { border: 1px solid var(--admin-line); border-radius: 4px; background: var(--admin-surface); color: var(--admin-text); font: inherit; }
    @media (max-width: 767px) { body { padding: 0 16px 16px; } }
  }
`;
