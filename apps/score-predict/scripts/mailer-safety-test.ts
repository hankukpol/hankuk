import {
  isLocalMailPreviewEnabled,
  isMailerConfigured,
  sendAccountCodeEmail,
} from "@/lib/mailer";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const names = [
    "RESEND_API_KEY",
    "MAIL_FROM",
    "POLICE_MAIL_FROM",
    "FIRE_MAIL_FROM",
    "PASSWORD_RESET_MAIL_WEBHOOK_URL",
    "PASSWORD_RESET_MAIL_WEBHOOK_TOKEN",
    "PASSWORD_RESET_DEBUG_LINK",
    "NODE_ENV",
  ] as const;
  const original = Object.fromEntries(names.map((name) => [name, mutableEnv[name]]));

  try {
    for (const name of names) delete mutableEnv[name];
    mutableEnv.NODE_ENV = "production";
    mutableEnv.PASSWORD_RESET_DEBUG_LINK = "true";

    assert(!isMailerConfigured("police"), "Police mailer unexpectedly reports configured.");
    assert(!isMailerConfigured("fire"), "Fire mailer unexpectedly reports configured.");
    assert(!isLocalMailPreviewEnabled(), "Production enabled the local mail preview fallback.");

    let rejected = false;
    try {
      await sendAccountCodeEmail({
        tenantType: "police",
        purpose: "PASSWORD_RESET",
        to: "test@example.invalid",
        code: "ABCD-1234",
        expireMinutes: 15,
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "Production mail delivery without configuration did not fail closed.");

    mutableEnv.RESEND_API_KEY = "test-only-key";
    mutableEnv.POLICE_MAIL_FROM = "police@example.invalid";
    assert(isMailerConfigured("police"), "Tenant-specific police sender was not recognized.");
    assert(!isMailerConfigured("fire"), "Police sender configuration leaked into fire.");

    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.RESEND_API_KEY;
    delete mutableEnv.POLICE_MAIL_FROM;
    assert(isLocalMailPreviewEnabled(), "Explicit local preview mode was not recognized.");

    console.log(JSON.stringify({
      result: "passed",
      checks: [
        "production preview disabled",
        "unconfigured production delivery fails closed",
        "tenant-specific sender isolation",
        "explicit development preview enabled",
      ],
    }, null, 2));
  } finally {
    for (const name of names) {
      const value = original[name];
      if (value === undefined) delete mutableEnv[name];
      else mutableEnv[name] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
