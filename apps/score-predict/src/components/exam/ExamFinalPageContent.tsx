"use client";

import { useTenantConfig } from "@/components/providers/TenantProvider";
import dynamic from "next/dynamic";

type ExamFinalPageContentProps = {
  embedded?: boolean;
};

const FirePage = dynamic(() => import("@/app/exam/final/_FirePage"));
const PolicePage = dynamic(() => import("@/app/exam/final/_PolicePage"));

export default function ExamFinalPageContent({
  embedded = false,
}: ExamFinalPageContentProps) {
  const tenant = useTenantConfig();
  const Page = tenant.type === "police" ? PolicePage : FirePage;

  return <Page embedded={embedded} />;
}
