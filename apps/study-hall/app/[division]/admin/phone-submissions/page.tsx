import { PhoneSubmissionsWorkspace } from "@/components/phones/PhoneSubmissionsWorkspace";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";

type PhoneSubmissionsPageProps = {
  params: {
    division: string;
  };
};

export default async function PhoneSubmissionsPage({ params }: PhoneSubmissionsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "phoneSubmissions");
  return <PhoneSubmissionsWorkspace divisionSlug={params.division} />;
}
