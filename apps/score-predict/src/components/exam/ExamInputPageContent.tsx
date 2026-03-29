"use client";

import { useTenantConfig } from "@/components/providers/TenantProvider";
import dynamic from "next/dynamic";

type ExamInputPageContentProps = {
  embedded?: boolean;
  onSubmitted?: (submissionId: number) => void;
};

const FirePage = dynamic(() => import("@/app/exam/input/_FirePage"));
const PolicePage = dynamic(() => import("@/app/exam/input/_PolicePage"));

export default function ExamInputPageContent({
  embedded = false,
  onSubmitted,
}: ExamInputPageContentProps = {}) {
  const tenant = useTenantConfig();
  const Page = tenant.type === "police" ? PolicePage : FirePage;

  return <Page embedded={embedded} onSubmitted={onSubmitted} />;
}
