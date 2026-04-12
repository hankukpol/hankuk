"use client";

import { useTenantConfig } from "@/components/providers/TenantProvider";
import dynamic from "next/dynamic";

type ExamPredictionPageContentProps = {
  embedded?: boolean;
};

const FirePage = dynamic(() => import("@/app/exam/prediction/_FirePage"));
const PolicePage = dynamic(() => import("@/app/exam/prediction/_PolicePage"));

export default function ExamPredictionPageContent({
  embedded = false,
}: ExamPredictionPageContentProps) {
  const tenant = useTenantConfig();
  const Page = tenant.type === "police" ? PolicePage : FirePage;

  return <Page embedded={embedded} />;
}
