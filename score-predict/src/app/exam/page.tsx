import { redirect } from "next/navigation";
import { getPreferredExamRoute } from "@/lib/exam-surface";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function ExamRootPage() {
  const settings = await getSiteSettingsUncached();
  const preferredExamRoute = getPreferredExamRoute(settings, {
    isAuthenticated: false,
    hasSubmission: false,
  });

  redirect(preferredExamRoute.href);
}
