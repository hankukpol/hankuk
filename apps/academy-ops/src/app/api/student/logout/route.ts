import { NextResponse } from "next/server";
import { STUDENT_SESSION_COOKIE_NAME } from "@/lib/auth/student-jwt";

export async function POST() {
  const response = NextResponse.json({ data: { success: true } });

  response.cookies.set({
    name: STUDENT_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function DELETE() {
  return POST();
}
