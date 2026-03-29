import type { NoticeState } from "../_lib/use-site-settings-manager";

type SiteSettingsNoticeProps = {
  notice: NoticeState;
};

export default function SiteSettingsNotice({ notice }: SiteSettingsNoticeProps) {
  if (!notice) {
    return null;
  }

  return (
    <p
      className={`rounded-md px-3 py-2 text-sm ${
        notice.type === "success"
          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {notice.message}
    </p>
  );
}
