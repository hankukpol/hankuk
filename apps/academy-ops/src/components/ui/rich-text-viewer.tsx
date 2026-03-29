import clsx from "clsx";
import { sanitizeRichTextHtml } from "@/lib/rich-text";

type RichTextViewerProps = {
  html: string;
  className?: string;
};

export function RichTextViewer({ html, className }: RichTextViewerProps) {
  const safeHtml = sanitizeRichTextHtml(html);

  return (
    <div
      className={clsx(
        "text-sm leading-7 text-ink [&_a]:font-medium [&_a]:text-ember [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-ember/30 [&_blockquote]:pl-4 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
