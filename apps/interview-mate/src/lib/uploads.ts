export const MAX_SPREADSHEET_UPLOAD_BYTES = 5 * 1024 * 1024;

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)}KB`;
  }

  return `${bytes}B`;
}

export function getSpreadsheetUploadLimitMessage() {
  return `업로드 파일은 ${formatBytes(MAX_SPREADSHEET_UPLOAD_BYTES)} 이하여야 합니다.`;
}
