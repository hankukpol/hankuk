"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";

interface AuthSessionProviderProps {
  children: ReactNode;
}

export default function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  return <SessionProvider basePath="/api/auth">{children}</SessionProvider>;
}
