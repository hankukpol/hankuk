"use client";

import { Download, FileText, Trash2, Upload, X } from "lucide-react";
import { type DragEvent, useState } from "react";

export type AbsenceNoteAttachmentRecord = {
  id: number;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

type AbsenceNoteAttachmentPanelProps = {
  title?: string;
  description?: string;
  emptyMessage?: string;
  selectedFiles: File[];
  existingAttachments?: AbsenceNoteAttachmentRecord[];
  disabled?: boolean;
  canDeleteExisting?: boolean;
  onFilesSelected: (files: FileList | null) => void;
  onRemoveSelected: (index: number) => void;
  onDeleteExisting?: (attachment: AbsenceNoteAttachmentRecord) => void;
  onDownloadExisting?: (attachment: AbsenceNoteAttachmentRecord) => void;
};

function formatFileSize(byteSize: number) {
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)}MB`;
  }

  if (byteSize >= 1024) {
    return `${Math.round(byteSize / 1024)}KB`;
  }

  return `${byteSize}B`;
}

export function AbsenceNoteAttachmentPanel({
  title = "첨부 파일",
  description = "PDF, JPG, PNG 파일을 최대 5MB까지 첨부할 수 있습니다.",
  emptyMessage = "첨부된 파일이 없습니다.",
  selectedFiles,
  existingAttachments = [],
  disabled = false,
  canDeleteExisting = true,
  onFilesSelected,
  onRemoveSelected,
  onDeleteExisting,
  onDownloadExisting,
}: AbsenceNoteAttachmentPanelProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const hasSelectedFiles = selectedFiles.length > 0;
  const hasExistingAttachments = existingAttachments.length > 0;

  function clearDragState() {
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (disabled) {
      clearDragState();
      return;
    }

    onFilesSelected(event.dataTransfer.files);
    clearDragState();
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    clearDragState();
  }

  const dropzoneClassName = disabled
    ? "cursor-not-allowed border-ink/10 bg-white text-slate"
    : isDragActive
      ? "border-ember/45 bg-ember/10 text-ink"
      : "border-ink/15 bg-white hover:border-ember/35 hover:bg-ember/5";

  return (
    <div className="space-y-3 rounded-[28px] border border-ink/10 bg-mist/50 p-4">
      <div>
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <p className="mt-1 text-xs leading-6 text-slate">{description}</p>
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed px-4 py-6 text-center transition ${dropzoneClassName}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragActive(true);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragActive(true);
          }
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="h-5 w-5" />
        <span className="text-sm font-medium">파일 선택 또는 드래그</span>
        <span className="text-xs text-slate">PDF, JPG, JPEG, PNG / 최대 5MB</span>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          disabled={disabled}
          className="hidden"
          onChange={(event) => {
            onFilesSelected(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {hasSelectedFiles ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">업로드 예정</div>
          {selectedFiles.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-3 py-2.5">
              <FileText className="h-4 w-4 text-slate" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{file.name}</div>
                <div className="text-xs text-slate">{formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                disabled={disabled}
                aria-label={`${file.name} 첨부 제거`}
                onClick={() => onRemoveSelected(index)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">등록된 첨부</div>
        {hasExistingAttachments ? (
          existingAttachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-3 py-2.5">
              <FileText className="h-4 w-4 text-slate" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{attachment.originalFileName}</div>
                <div className="text-xs text-slate">
                  {formatFileSize(attachment.byteSize)} · {attachment.contentType}
                </div>
              </div>
              {onDownloadExisting ? (
                <button
                  type="button"
                  aria-label={`${attachment.originalFileName} 다운로드`}
                  onClick={() => onDownloadExisting(attachment)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-forest/30 hover:text-forest"
                >
                  <Download className="h-4 w-4" />
                </button>
              ) : null}
              {onDeleteExisting ? (
                <button
                  type="button"
                  disabled={disabled || !canDeleteExisting}
                  aria-label={`${attachment.originalFileName} 첨부 삭제`}
                  onClick={() => onDeleteExisting(attachment)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-ink/10 bg-white px-4 py-4 text-sm text-slate">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
