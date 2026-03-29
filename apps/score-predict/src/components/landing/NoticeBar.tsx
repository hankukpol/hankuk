import { Megaphone } from "lucide-react";
import type { PublicNoticeItem } from "@/lib/site-settings";

interface NoticeBarProps {
  notices: PublicNoticeItem[];
}

export default function NoticeBar({ notices }: NoticeBarProps) {
  if (notices.length < 1) return null;

  return (
    <section className="border border-rose-200 bg-rose-50 p-6">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-rose-600" />
        <h2 className="text-base font-bold text-slate-900">공지사항 / 이용안내</h2>
      </div>
      <ul className="mt-4 space-y-3">
        {notices.map((notice) => (
          <li key={notice.id} className="rounded-md border border-rose-200/60 bg-white p-4">
            <p className="text-sm font-bold text-slate-900">{notice.title}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{notice.content}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
