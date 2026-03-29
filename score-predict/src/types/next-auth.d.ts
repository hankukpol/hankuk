import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: Role;
      phone?: string;    // 소방: 전화번호 로그인
      username?: string;  // 경찰: 아이디 로그인
    };
  }

  interface User {
    id: string;
    role: Role;
    phone?: string;
    username?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    phone?: string;
    username?: string;
  }
}
