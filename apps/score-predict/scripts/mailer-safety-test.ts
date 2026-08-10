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
    "POLICE_SMTP_HOST",
    "POLICE_SMTP_PORT",
    "POLICE_SMTP_SECURE",
    "POLICE_SMTP_USER",
    "POLICE_SMTP_APP_PASSWORD",
    "FIRE_SMTP_HOST",
    "FIRE_SMTP_PORT",
    "FIRE_SMTP_SECURE",
    "FIRE_SMTP_USER",
    "FIRE_SMTP_APP_PASSWORD",
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

    mutableEnv.NODE_ENV = "production";
    mutableEnv.POLICE_MAIL_FROM = "경찰 합격예측 <police@example.invalid>";
    mutableEnv.POLICE_SMTP_HOST = "smtp.example.invalid";
    mutableEnv.POLICE_SMTP_PORT = "465";
    mutableEnv.POLICE_SMTP_SECURE = "true";
    mutableEnv.POLICE_SMTP_USER = "police-account";
    mutableEnv.POLICE_SMTP_APP_PASSWORD = "test-only-app-password";

    assert(isMailerConfigured("police"), "Police SMTP configuration was not recognized.");
    assert(!isMailerConfigured("fire"), "Police SMTP configuration leaked into fire.");

    mutableEnv.FIRE_MAIL_FROM = "소방 합격예측 <fire@example.invalid>";
    mutableEnv.FIRE_SMTP_HOST = "smtp.example.invalid";
    mutableEnv.FIRE_SMTP_PORT = "not-a-port";
    mutableEnv.FIRE_SMTP_SECURE = "true";
    mutableEnv.FIRE_SMTP_USER = "fire-account";
    mutableEnv.FIRE_SMTP_APP_PASSWORD = "test-only-app-password";
    assert(!isMailerConfigured("fire"), "Invalid fire SMTP port was accepted.");

    console.log(JSON.stringify({
      result: "passed",
      checks: [
        "production preview disabled",
        "unconfigured production delivery fails closed",
        "tenant-specific sender isolation",
        "explicit development preview enabled",
        "tenant-specific SMTP isolation",
        "invalid SMTP configuration fails closed",
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
