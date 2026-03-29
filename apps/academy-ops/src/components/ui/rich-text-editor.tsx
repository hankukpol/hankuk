"use client";

import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import clsx from "clsx";
import { useEffect } from "react";
import { sanitizeRichTextHtml } from "@/lib/rich-text";

type RichTextEditorProps = {
  content: string;
  onChange: (html: string) => void;
  disabled?: boolean;
};

function ToolbarButton({
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "border-ink bg-ink text-white"
          : "border-ink/10 bg-white text-ink hover:border-ember/30 hover:text-ember",
        disabled && "cursor-not-allowed border-ink/10 bg-mist text-slate",
      )}
    >
      {label}
    </button>
  );
}

export function RichTextEditor({ content, onChange, disabled = false }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
    ],
    content: sanitizeRichTextHtml(content),
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "min-h-[220px] px-4 py-4 text-sm leading-7 text-ink outline-none [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-slate [&_p.is-editor-empty:first-child::before]:content-['공지사항_내용을_입력하세요']",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextHtml = sanitizeRichTextHtml(content);
    if (editor.getHTML() !== nextHtml) {
      editor.commands.setContent(nextHtml || "<p></p>", { emitUpdate: false });
    }
    editor.setEditable(!disabled);
  }, [content, disabled, editor]);

  function setLink() {
    if (!editor) {
      return;
    }

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 주소를 입력하세요.", previousUrl ?? "https://");

    if (url === null) {
      return;
    }

    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-ink/10 bg-mist px-3 py-3">
        <ToolbarButton label="굵게" onClick={() => editor?.chain().focus().toggleBold().run()} active={Boolean(editor?.isActive("bold"))} disabled={disabled || !editor} />
        <ToolbarButton label="기울임" onClick={() => editor?.chain().focus().toggleItalic().run()} active={Boolean(editor?.isActive("italic"))} disabled={disabled || !editor} />
        <ToolbarButton label="제목" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={Boolean(editor?.isActive("heading", { level: 2 }))} disabled={disabled || !editor} />
        <ToolbarButton label="목록" onClick={() => editor?.chain().focus().toggleBulletList().run()} active={Boolean(editor?.isActive("bulletList"))} disabled={disabled || !editor} />
        <ToolbarButton label="번호" onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={Boolean(editor?.isActive("orderedList"))} disabled={disabled || !editor} />
        <ToolbarButton label="링크" onClick={setLink} active={Boolean(editor?.isActive("link"))} disabled={disabled || !editor} />
      </div>
      <EditorContent editor={editor} className="bg-white" />
    </div>
  );
}
