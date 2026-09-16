/** Local review only. Defaults off; credentials cannot accidentally turn this on. */
export function isExamPreviewEnabled() {
  return process.env.EXAM_ANALYSIS_PREVIEW === 'true' && process.env.MOCK_MODE === 'true';
}
