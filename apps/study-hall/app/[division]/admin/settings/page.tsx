import { redirect } from "next/navigation";

type SettingsHubPageProps = {
  params: {
    division: string;
  };
};

export default function SettingsHubPage({ params }: SettingsHubPageProps) {
  redirect(`/${params.division}/admin/settings/general`);
}
