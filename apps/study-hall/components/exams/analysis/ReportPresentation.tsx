"use client";

import { createContext, useContext, type ReactNode } from "react";

const DocumentContext = createContext(false);
export const ReportDocumentProvider = DocumentContext.Provider;
export const useReportDocument = () => useContext(DocumentContext);

export function ReportMetrics({ entries, title = "주요 지표", "data-report-section": section }: {
  entries: ReactNode[][]; title?: string; "data-report-section"?: "overview";
}) {
  const document = useReportDocument();
  if (!document) return <div data-report-section={section} className="admin-metric-strip">
    {entries.map(([label, score], index) => <div className="admin-metric-box" key={index}><p className="admin-metric-box-label">{label}</p><p className={/\d/.test(String(score)) ? "admin-metric-box-value" : "admin-metric-box-value admin-metric-box-status"}>{score}</p></div>)}
  </div>;
  return <section data-report-section={section} className="admin-section">
    <h2 className="admin-section-title">{title}</h2>
    <div className="admin-table-frame"><table className="report-summary-table">
      <thead><tr><th scope="col">항목</th><th scope="col">결과</th></tr></thead>
      <tbody>{entries.map(([label, score], index) => <tr key={index}><th scope="row">{label}</th><td className="tabular-nums font-semibold">{score}</td></tr>)}</tbody>
    </table></div>
  </section>;
}
