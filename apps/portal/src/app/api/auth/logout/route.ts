import { NextRequest, NextResponse } from "next/server";
import { PORTAL_SESSION_COOKIE, portalCookieOptions } from "@/lib/portal-session";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?loggedOut=1", request.url), { status: 303 });
  response.cookies.set(PORTAL_SESSION_COOKIE, "", portalCookieOptions(0));
  return response;
}
