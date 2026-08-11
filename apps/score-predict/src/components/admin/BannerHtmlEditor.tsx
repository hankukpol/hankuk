"use client";

import AdminHtmlEditor from "@/components/admin/AdminHtmlEditor";

interface BannerHtmlEditorProps {
  value: string;
  onChange: (content: string) => void;
  height?: string;
}

export default function BannerHtmlEditor({ value, onChange, height = "400" }: BannerHtmlEditorProps) {
  return (
    <AdminHtmlEditor
      value={value}
      onChange={onChange}
      uploadUrl="/api/admin/banners/upload-image"
      height={height}
      ariaLabel="배너 HTML 편집기"
      allowVideo
    />
  );
}
