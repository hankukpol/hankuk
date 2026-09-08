import { examAnalysisExportSchema, type ExamAnalysisExportInput } from '@/lib/exam-analysis-export-schemas';
import { regularAnalysisExportRows, morningAnalysisExportRows, type ExamAnalysisExport } from '@/lib/exam-analysis-export-meta';
import { getRegularCohortAnalysis } from '@/lib/services/exam-analysis.service';
import { getMorningCohortAnalysis } from '@/lib/services/morning-exam-analysis.service';

/** Called only after the export route's administrator and division feature guards. */
export async function getExamAnalysisExportRows(divisionSlug: string, input: ExamAnalysisExportInput): Promise<ExamAnalysisExport> {
  const parsed = examAnalysisExportSchema.parse(input);
  if (parsed.kind === 'regular') {
    return regularAnalysisExportRows(await getRegularCohortAnalysis(divisionSlug, parsed.examTypeId, parsed.examDate, 20));
  }
  return morningAnalysisExportRows(await getMorningCohortAnalysis(divisionSlug, parsed.examTypeId, { from: parsed.from, to: parsed.to }));
}
