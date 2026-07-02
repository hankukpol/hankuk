import { redirect } from "next/navigation";

import { PhoneSubmissionsWorkspace } from "@/components/phones/PhoneSubmissionsWorkspace";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type AssistantPhonesPageProps = {
  params: {
    division: string;
  };
};

export default async function AssistantPhonesPage({ params }: AssistantPhonesPageProps) {
  const settings = await getDivisionFeatureSettings(params.division);

  if (!settings.featureFlags.phoneSubmissions) {
    redirect(`/${params.division}/assistant`);
  }

  return (
    <PhoneSubmissionsWorkspace
      divisionSlug={params.division}
      showHistory={false}
      mode="assistant"
    />
  );
}
