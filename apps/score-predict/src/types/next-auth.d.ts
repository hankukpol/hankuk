import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: Role;
      phone?: string;
      username?: string;
      sharedUserId?: string;
    };
  }

  interface User {
    id: string;
    role: Role;
    phone?: string;
    username?: string;
    sharedUserId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    phone?: string;
    username?: string;
    sharedUserId?: string;
  }
}
