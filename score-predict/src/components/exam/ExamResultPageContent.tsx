"use client";

import { useTenantConfig } from "@/components/providers/TenantProvider";
import dynamic from "next/dynamic";

type ExamResultPageContentProps = {
  embedded?: boolean;
};

const FirePage = dynamic(() => import("@/app/exam/result/_FirePage"));
const PolicePage = dynamic(() => import("@/app/exam/result/_PolicePage"));

export default function ExamResultPageContent({
  embedded = false,
}: ExamResultPageContentProps = {}) {
  const tenant = useTenantConfig();
  const Page = tenant.type === "police" ? PolicePage : FirePage;

  return <Page embedded={embedded} />;
}
