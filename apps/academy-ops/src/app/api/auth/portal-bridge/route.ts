import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { AdminRole } from "@/lib/prisma-client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const APP_KEY = "academy-ops";

type ConsumedPortalLaunch = {
  user_id: string;
  division_slug: string | null;
  target_path: string;
  target_role: "super_admin" | "admin" | "assistant" | "staff";
};

function normalizeTargetPath(targetPath: string | null | undefined, fallback: string) {
  if (!targetPath || !targetPath.startsWith("/") || targetPath.startsWith("//")) {
    return fallback;
  }

  return targetPath;
}

async function consumePortalLaunchToken(token: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("consume_portal_launch_token" as never, {
    p_plain_token: token,
    p_app_key: APP_KEY,
  } as never);

  if (error) {
    throw new Error(`Failed to consume portal launch token: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return (row as ConsumedPortalLaunch | null) ?? null;
}

function createRouteSupabaseClient(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase public environment variables are missing.");
  }

  const cookieOverrides = new Map<string, string | null>();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        if (cookieOverrides.has(name)) {
          return cookieOverrides.get(name) ?? undefined;
        }

        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieOverrides.set(name, value);
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieOverrides.set(name, null);
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData().catch(() => null);
    const launchToken = String(formData?.get("launchToken") || "").trim();

    if (!launchToken) {
      return NextResponse.json({ error: "Portal launch token is required." }, { status: 400 });
    }

    const consumed = await consumePortalLaunchToken(launchToken);
    if (!consumed) {
      return NextResponse.json({ error: "Portal launch token is invalid or expired." }, { status: 401 });
    }

    if (consumed.target_role !== "admin" && consumed.target_role !== "super_admin") {
      return NextResponse.json(
        { error: "Academy Ops portal bridge only supports admin launches." },
        { status: 403 },
      );
    }

    const adminRecord = await getPrisma().adminUser.findUnique({
      where: { id: consumed.user_id },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

    if (!adminRecord || !adminRecord.isActive) {
      return NextResponse.json(
        { error: "The linked academy-ops admin account could not be found." },
        { status: 403 },
      );
    }

    if (consumed.target_role === "super_admin" && adminRecord.role !== AdminRole.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "This academy-ops account does not have super-admin access." },
        { status: 403 },
      );
    }

    const adminClient = createAdminClient();
    const authUserResult = await adminClient.auth.admin.getUserById(consumed.user_id);
    if (authUserResult.error) {
      throw new Error(`Failed to load academy-ops auth user: ${authUserResult.error.message}`);
    }

    const email = authUserResult.data.user?.email;
    if (!email) {
      return NextResponse.json(
        { error: "The linked academy-ops auth user is missing an email address." },
        { status: 403 },
      );
    }

    const fallbackPath = "/admin";
    const destination = normalizeTargetPath(consumed.target_path, fallbackPath);
    const redirectUrl = new URL(destination, request.url);

    const generatedLink = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (generatedLink.error) {
      throw new Error(`Failed to generate academy-ops session link: ${generatedLink.error.message}`);
    }

    const tokenHash = generatedLink.data.properties?.hashed_token;
    if (!tokenHash) {
      throw new Error("Supabase did not return a magic-link token hash.");
    }

    const response = NextResponse.redirect(redirectUrl);
    const supabase = createRouteSupabaseClient(request, response);
    const verification = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    if (verification.error) {
      throw new Error(`Failed to exchange the academy-ops magic link for a session: ${verification.error.message}`);
    }

    if (!verification.data.user || verification.data.user.id !== consumed.user_id) {
      return NextResponse.json(
        { error: "The created academy-ops session did not match the requested user." },
        { status: 403 },
      );
    }

    return response;
  } catch (error) {
    console.error("[portal-bridge] academy-ops bridge failed.", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to complete the academy-ops portal launch.",
      },
      { status: 500 },
    );
  }
}
