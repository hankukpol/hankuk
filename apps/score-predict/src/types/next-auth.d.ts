import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";
import type { TenantType } from "@/lib/tenant";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: Role;
      phone?: string;
      username?: string;
      tenantType: TenantType | null;
      sessionVersion: number;
    };
  }

  interface User {
    id: string;
    role: Role;
    phone?: string;
    username?: string;
    tenantType?: TenantType;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    phone?: string;
    username?: string;
    tenantType?: TenantType;
    sessionVersion?: number;
  }
}
