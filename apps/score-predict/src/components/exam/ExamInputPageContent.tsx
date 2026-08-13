"use client";

import { useTenantConfig } from "@/components/providers/TenantProvider";
import dynamic from "next/dynamic";

type ExamInputPageContentProps = {
  embedded?: boolean;
  onSubmitted?: (submissionId: number) => void;
  presentation?: "default" | "pre-registration-modal";
};

const FirePage = dynamic(() => import("@/app/exam/input/_FirePage"));
const PolicePage = dynamic(() => import("@/app/exam/input/_PolicePage"));

export default function ExamInputPageContent({
  embedded = false,
  onSubmitted,
  presentation = "default",
}: ExamInputPageContentProps) {
  const tenant = useTenantConfig();

  if (tenant.type === "police") {
    return (
      <PolicePage
        embedded={embedded}
        onSubmitted={onSubmitted}
        presentation={presentation}
      />
    );
  }

  return <FirePage embedded={embedded} onSubmitted={onSubmitted} />;
}
