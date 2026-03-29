import { AdminRole } from "@prisma/client";
import { NotificationTemplateManager } from "@/components/notifications/notification-template-manager";
import { requireAdminContext } from "@/lib/auth";
import { getSetupState } from "@/lib/env";
import {
  ensureNotificationTemplates,
  listNotificationTemplates,
} from "@/lib/notifications/template-service";

const REQUIRED_KEYS = [
  "SOLAPI_API_KEY",
  "SOLAPI_API_SECRET",
  "SOLAPI_SENDER",
] as const;

const OPTIONAL_ALIMTALK_KEYS = ["SOLAPI_PF_ID"] as const;

const LEGACY_TEMPLATE_KEYS = [
  "SOLAPI_TEMPLATE_WARNING_1",
  "SOLAPI_TEMPLATE_WARNING_2",
  "SOLAPI_TEMPLATE_DROPOUT",
  "SOLAPI_TEMPLATE_ABSENCE_NOTE",
  "SOLAPI_TEMPLATE_POINT",
  "SOLAPI_TEMPLATE_NOTICE",
] as const;

export const dynamic = "force-dynamic";

export default async function AdminNotificationTemplatePage() {
  const context = await requireAdminContext(AdminRole.SUPER_ADMIN);
  const setup = getSetupState();

  await ensureNotificationTemplates(context.adminUser.id);
  const templates = await listNotificationTemplates();

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        D-11 Notification Templates
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">Notification Templates</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        Manage the message body and optional Solapi template id used by automatic and manual notification sends.
      </p>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
              setup.notificationReady
                ? "border-forest/20 bg-forest/10 text-forest"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {setup.notificationReady ? "Ready" : "Needs setup"}
          </span>
          <p className="text-sm text-slate">
            Missing required env keys: {setup.missingNotificationKeys.join(", ") || "None"}
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-3">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold text-ink">Required env keys</h2>
          <div className="mt-4 space-y-3">
            {REQUIRED_KEYS.map((key) => {
              const present = !setup.missingNotificationKeys.includes(key);

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-ink">{key}</span>
                  <span className={present ? "text-forest" : "text-amber-700"}>
                    {present ? "Configured" : "Missing"}
                  </span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold text-ink">Optional AlimTalk keys</h2>
          <p className="mt-2 text-sm leading-7 text-slate">
            These keys are only needed when you want to use AlimTalk template delivery instead of SMS fallback.
          </p>
          <div className="mt-4 space-y-3">
            {OPTIONAL_ALIMTALK_KEYS.map((key) => {
              const present = Boolean(process.env[key]);

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-ink">{key}</span>
                  <span className={present ? "text-forest" : "text-slate"}>
                    {present ? "Configured" : "Not set"}
                  </span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold text-ink">Legacy fallback env keys</h2>
          <p className="mt-2 text-sm leading-7 text-slate">
            These keys are optional now. They are only used as a fallback when a DB template id has not been saved yet.
          </p>
          <div className="mt-4 space-y-3">
            {LEGACY_TEMPLATE_KEYS.map((key) => {
              const present = Boolean(process.env[key]);

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-ink">{key}</span>
                  <span className={present ? "text-forest" : "text-slate"}>
                    {present ? "Configured" : "Not set"}
                  </span>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <NotificationTemplateManager initialTemplates={templates} />
    </div>
  );
}