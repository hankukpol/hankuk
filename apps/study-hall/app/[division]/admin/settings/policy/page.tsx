import { redirect } from "next/navigation";

export default function SettingsRedirect({ params }: { params: { division: string } }) {
  redirect(`/${params.division}/admin/settings/rules?section=policy`);
}
