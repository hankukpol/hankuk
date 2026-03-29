"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import type SunEditorCore from "suneditor/src/lib/core";
import "suneditor/dist/css/suneditor.min.css";

// SunEditor는 window 객체를 필요로 하므로 SSR 비활성화
const SunEditor = dynamic(() => import("suneditor-react"), { ssr: false });

interface BannerHtmlEditorProps {
  value: string;
  onChange: (content: string) => void;
  height?: string;
}

export default function BannerHtmlEditor({ value, onChange, height = "400" }: BannerHtmlEditorProps) {
  const editorRef = useRef<SunEditorCore | null>(null);

  function getSunEditorInstance(editor: SunEditorCore) {
    editorRef.current = editor;
  }

  /**
   * 에디터 내 이미지 삽입 시 서버에 업로드 후 URL로 대체.
   * base64 직접 삽입을 방지하여 DB 크기를 절약한다.
   */
  function handleImageUploadBefore(
    files: File[],
    _info: object,
    uploadHandler: (result: { result: Array<{ url: string; name: string; size: number }> } | { errorMessage: string }) => void,
  ) {
    const file = files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    fetch("/api/admin/banners/upload-image", {
      method: "POST",
      body: formData,
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          url?: string;
          error?: string;
          details?: string;
        };

        if (res.ok && data.success && data.url) {
          uploadHandler({
            result: [{ url: data.url, name: file.name, size: file.size }],
          });
        } else {
          const message = data.details ? `${data.error ?? "이미지 업로드에 실패했습니다."} (${data.details})` : (data.error ?? "이미지 업로드에 실패했습니다.");
          uploadHandler({ errorMessage: message });
        }
      })
      .catch(() => {
        uploadHandler({ errorMessage: "이미지 업로드 중 오류가 발생했습니다." });
      });

    // undefined를 반환하여 SunEditor의 기본 base64 삽입을 차단
    return undefined;
  }

  return (
    <>
      <SunEditor
        lang="ko"
        getSunEditorInstance={getSunEditorInstance}
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
            ["link", "image", "video"],
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
    </>
  );
}
