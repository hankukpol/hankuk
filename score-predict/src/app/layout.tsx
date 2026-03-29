import type { Metadata } from "next";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import AuthSessionProvider from "@/components/providers/AuthSessionProvider";
import { TenantProvider } from "@/components/providers/TenantProvider";
import ToastProvider from "@/components/providers/ToastProvider";
import VisitorTracker from "@/components/VisitorTracker";
import { getServerTenantConfig } from "@/lib/tenant.server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getServerTenantConfig();

  return {
    title: tenant.siteTitle,
    description: tenant.siteDescription,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenant = await getServerTenantConfig();

  return (
    <html lang="ko">
      <body className="bg-slate-100 text-slate-100 antialiased">
        <TenantProvider tenantType={tenant.type}>
          <AuthSessionProvider>
            <ToastProvider>
              {tenant.features.visitorTracker ? <VisitorTracker /> : null}
              <div className="flex min-h-screen flex-col">
                <Header />
                <div className="flex-1 text-slate-900">{children}</div>
                <Footer />
              </div>
            </ToastProvider>
          </AuthSessionProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
