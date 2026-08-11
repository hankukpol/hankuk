"use client";

import dynamic from "next/dynamic";
import "suneditor/dist/css/suneditor.min.css";

const SunEditor = dynamic(() => import("suneditor-react"), { ssr: false });

interface AdminHtmlEditorProps {
  value: string;
  onChange: (content: string) => void;
  uploadUrl: string;
  height?: string;
  ariaLabel?: string;
  allowVideo?: boolean;
}

export default function AdminHtmlEditor({
  value,
  onChange,
  uploadUrl,
  height = "400",
  ariaLabel = "본문 편집기",
  allowVideo = false,
}: AdminHtmlEditorProps) {
  function handleImageUploadBefore(
    files: File[],
    _info: object,
    uploadHandler: (result: { result: Array<{ url: string; name: string; size: number }> } | { errorMessage: string }) => void,
  ) {
    const file = files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    fetch(uploadUrl, {
      method: "POST",
      body: formData,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          url?: string;
          error?: string;
          details?: string;
        };

        if (response.ok && data.success && data.url) {
          uploadHandler({
            result: [{ url: data.url, name: file.name, size: file.size }],
          });
          return;
        }

        const message = data.details
          ? `${data.error ?? "이미지 업로드에 실패했습니다."} (${data.details})`
          : (data.error ?? "이미지 업로드에 실패했습니다.");
        uploadHandler({ errorMessage: message });
      })
      .catch(() => {
        uploadHandler({ errorMessage: "이미지 업로드 중 오류가 발생했습니다." });
      });

    return undefined;
  }

  return (
    <div role="group" aria-label={ariaLabel} className="overflow-hidden rounded-md border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-service-600">
      <SunEditor
        lang="ko"
        setContents={value}
        onChange={onChange}
        onImageUploadBefore={handleImageUploadBefore}
        height={height}
        setOptions={{
          buttonList: [
            ["undo", "redo"],
            ["formatBlock", "fontSize"],
            ["bold", "italic", "underline", "strike"],
            ["fontColor", "hiliteColor"],
            ["align", "horizontalRule", "list"],
            allowVideo ? ["link", "image", "video"] : ["link", "image"],
            ["codeView"],
            ["fullScreen"],
            ["removeFormat"],
          ],
          imageFileInput: true,
          imageUrlInput: true,
          imageUploadSizeLimit: 5 * 1024 * 1024,
          imageAccept: ".jpg,.jpeg,.png,.webp",
        }}
      />
    </div>
  );
}
