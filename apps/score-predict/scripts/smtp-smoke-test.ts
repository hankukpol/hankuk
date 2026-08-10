import { isMailerConfigured, sendAccountCodeEmail } from "@/lib/mailer";
import type { TenantType } from "@/lib/tenant";

async function main() {
  const tenantType = process.env.SMTP_SMOKE_TENANT?.trim() as TenantType | undefined;
  const to = process.env.SMTP_SMOKE_TO?.trim();

  if (tenantType !== "police" && tenantType !== "fire") {
    throw new Error("SMTP_SMOKE_TENANT must be police or fire.");
  }
  if (!to) {
    throw new Error("SMTP_SMOKE_TO is required.");
  }
  if (!isMailerConfigured(tenantType)) {
    throw new Error(`${tenantType} mailer is not fully configured.`);
  }

  await sendAccountCodeEmail({
    tenantType,
    purpose: "EMAIL_VERIFICATION",
    to,
    name: "SMTP 점검",
    code: "TEST-2026",
    expireMinutes: 5,
  });

  console.log(JSON.stringify({ result: "sent", tenantType, to }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
