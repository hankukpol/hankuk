import { Megaphone } from "lucide-react";
import { richTextToPlainText } from "@/lib/rich-text";
import type { PublicNoticeItem } from "@/lib/site-settings";

interface NoticeBarProps {
  notices: PublicNoticeItem[];
}

export default function NoticeBar({ notices }: NoticeBarProps) {
  if (notices.length < 1) return null;

  return (
    <section className="border border-service-200 bg-service-50 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-service-600" />
        <h2 className="text-base font-bold text-slate-900">공지사항 / 이용안내</h2>
      </div>
      <ul className="mt-4 border-y border-service-200 bg-white">
        {notices.map((notice) => (
          <li key={notice.id} className="border-b border-service-100 p-4 last:border-b-0">
            <p className="text-sm font-bold text-slate-900">{notice.title}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {richTextToPlainText(notice.content)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
