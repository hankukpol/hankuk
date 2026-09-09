export const WARNING_NOTICE_CHANNEL_VALUES = ["SMS", "PHONE", "IN_PERSON", "OTHER"] as const;

export type WarningNoticeChannelValue = (typeof WARNING_NOTICE_CHANNEL_VALUES)[number];

export const WARNING_NOTICE_CHANNEL_OPTIONS = [
  { value: "SMS", label: "문자" },
  { value: "PHONE", label: "전화" },
  { value: "IN_PERSON", label: "대면" },
  { value: "OTHER", label: "기타" },
] as const satisfies ReadonlyArray<{ value: WarningNoticeChannelValue; label: string }>;

export function getWarningNoticeChannelLabel(value: string | null | undefined) {
  return WARNING_NOTICE_CHANNEL_OPTIONS.find((option) => option.value === value)?.label ?? "기타";
}
