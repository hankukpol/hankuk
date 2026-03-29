import { AdminRole } from "@prisma/client";
import { getCurrentAdminContext, roleAtLeast } from "@/lib/auth";

export async function requireApiAdmin(minRole: AdminRole) {
  const context = await getCurrentAdminContext();

  if (!context) {
    return {
      ok: false as const,
      status: 401,
      error: "\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
    };
  }

  if (!roleAtLeast(context.adminUser.role, minRole)) {
    return {
      ok: false as const,
      status: 403,
      error: "\uC774 \uC791\uC5C5\uC744 \uC218\uD589\uD560 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
    };
  }

  return {
    ok: true as const,
    context,
  };
}