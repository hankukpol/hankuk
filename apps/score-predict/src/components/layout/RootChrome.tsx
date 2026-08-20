"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";

function isAdminPath(pathname: string) {
  const tenantlessPath = pathname.replace(/^\/(police|fire)(?=\/|$)/, "");
  return tenantlessPath === "/admin" || tenantlessPath.startsWith("/admin/");
}

export default function RootChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAdminPath(pathname)) {
    return children;
  }

  return (
    <div className="public-product-shell flex min-h-screen flex-col">
      <Header />
      <div className="flex-1 text-slate-900">{children}</div>
      <Footer />
    </div>
  );
}
