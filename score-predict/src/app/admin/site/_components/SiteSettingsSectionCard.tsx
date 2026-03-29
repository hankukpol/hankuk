import type { NoticeState } from "../_lib/use-site-settings-manager";
import SiteSettingsNotice from "./SiteSettingsNotice";

type SiteSettingsSectionCardProps = {
  title: string;
  description?: string;
  notice?: NoticeState;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function SiteSettingsSectionCard({
  title,
  description,
  notice = null,
  children,
  footer,
}: SiteSettingsSectionCardProps) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </div>

      <SiteSettingsNotice notice={notice} />

      {children}

      {footer ? <div>{footer}</div> : null}
    </section>
  );
}
