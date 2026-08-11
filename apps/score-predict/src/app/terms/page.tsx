import { getSiteSettings } from "@/lib/site-settings";
import PolicyDocument from "@/components/layout/PolicyDocument";

export const metadata = {
  title: "이용약관",
};

export default async function TermsPage() {
  let content = "";

  try {
    const settings = await getSiteSettings();
    const configured = settings["site.termsOfService"];
    if (typeof configured === "string") {
      content = configured;
    }
  } catch {
    // 설정을 불러오지 못하면 빈 본문으로 안내 문구를 표시한다.
  }

  return <PolicyDocument title="이용약관" content={content} />;
}
