export type ExamImportSelection = {
  category: "MORNING" | "REGULAR";
  examTypeId?: string;
  examRound?: number;
  topic?: string;
  overwrite?: boolean;
};

export type ExamImportPreview = {
  examDate: string;
  category: "MORNING" | "REGULAR";
  examTypeId: string | null;
  examTypeName: string | null;
  subjectNames: string[];
  cohortSize: number;
  itemCount: number;
  fullScore: number;
  mappings: { blockIndex: number; subjectName: string; itemCount: number }[];
  reproduction: {
    matchedCount: number;
    mismatches: {
      sourceRow: number;
      subjectName: string;
      expected: number | null;
      actual: number;
      reason: string;
    }[];
  };
  matching: { matched: number; unmatched: number; invalid: number };
  invalidRows: { sourceRow: number; reason: string }[];
  partialRows: {
    sourceRow: number;
    studentName: string | null;
    absent: boolean;
    subjectNames: string[];
  }[];
  errors: string[];
  existing: boolean;
  canConfirm: boolean;
};

export type ExamImportResult = {
  subjectId?: string | null;
  sessionId: string;
  importedCount: number;
  examDate: string;
  examTypeId: string;
  examRound: number | null;
};
