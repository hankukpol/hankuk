import { redirect } from "next/navigation";

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

  redirect(`/${params.division}/admin/phone-submissions`);
}
