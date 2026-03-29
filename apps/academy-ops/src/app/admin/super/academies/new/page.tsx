import { redirect } from "next/navigation";

export default function SuperAcademyNewPage() {
  redirect("/admin/super/academies?modal=create");
}
