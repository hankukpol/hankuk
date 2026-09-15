import { type ArrivalConfig } from "@/lib/arrivals";

export const ARRIVAL_CONFIG_FIELDS: { key: keyof ArrivalConfig; label: string; display: (config: ArrivalConfig) => string }[] = [
  { key: "enabled", label: "등원 체크", display: config => config.enabled ? "사용" : "사용 안 함" },
  { key: "effectiveDate", label: "적용일", display: config => config.effectiveDate === "1970-01-01" ? "설정 전" : config.effectiveDate },
  { key: "numberLength", label: "수험번호 자릿수", display: config => `${config.numberLength}자리` },
  { key: "popupMs", label: "완료 팝업 표시", display: config => `${config.popupMs / 1000}초` },
  { key: "deviceDays", label: "기기 승인 유효기간", display: config => `${config.deviceDays}일` },
];

export function ArrivalConfigSummary({ config }: { config: ArrivalConfig }) {
  return <dl className="admin-panel">{ARRIVAL_CONFIG_FIELDS.map(field => <div className="admin-panel-row flex flex-wrap justify-between gap-3" key={field.key}><dt className="admin-label">{field.label}</dt><dd className="tabular-nums">{field.display(config)}</dd></div>)}</dl>;
}
