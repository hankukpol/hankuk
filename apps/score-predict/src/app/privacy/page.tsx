import { getSiteSettings } from "@/lib/site-settings";
import PolicyDocument from "@/components/layout/PolicyDocument";

export const metadata = {
  title: "개인정보처리방침",
};

export default async function PrivacyPage() {
  let content = "";

  try {
    const settings = await getSiteSettings();
    const configured = settings["site.privacyPolicy"];
    if (typeof configured === "string") {
      content = configured;
    }
  } catch {
    // 설정을 불러오지 못하면 빈 본문으로 안내 문구를 표시한다.
  }

  return <PolicyDocument title="개인정보처리방침" content={content} />;
}
