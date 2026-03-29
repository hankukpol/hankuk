import { load } from "cheerio";
import { AttendType, ScoreSource } from "@prisma/client";
import { getSheetRows, readWorkbookFromBuffer, toCellString } from "@/lib/excel/workbook";

export type ParsedScoreRecord = {
  rowKey: string;
  rowNumber: number;
  examNumber: string | null;
  name: string;
  onlineId: string | null;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  sourceType: ScoreSource;
  note: string | null;
};

export type ParsedQuestionRecord = {
  questionNo: number;
  correctAnswer: string;
  correctRate: number | null;
  answerDistribution: Record<string, number> | null;
  difficulty: string | null;
};

export type ParsedAnswerRecord = {
  studentKey: string;
  questionNo: number;
  answer: string;
};

export type ParsedScoreImport = {
  sourceType: ScoreSource;
  matchingKey: "examNumber" | "onlineId";
  records: ParsedScoreRecord[];
  questions: ParsedQuestionRecord[];
  answers: ParsedAnswerRecord[];
  metadata: Record<string, unknown>;
};

export type ParsedOfflineScoreImport = ParsedScoreImport & {
  oxRecords: ParsedScoreRecord[];
  oxQuestions: ParsedQuestionRecord[];
  oxAnswers: ParsedAnswerRecord[];
};

type TableRows = Array<Array<string>>;

const OFFLINE_SCORE_SHEET_NAMES = ["score"];
const OFFLINE_ERRATA_SHEET_NAMES = ["errata"];
const ONLINE_SCORE_ID_HEADERS = ["온라인id", "수강생id", "수강자id", "아이디", "id"];

function normalizeHeader(value: unknown) {
  return toCellString(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeExamNumber(value: unknown) {
  const raw = toCellString(value).replace(/\s+/g, "");
  return raw ? raw.replace(/\.0$/, "") : null;
}


function normalizeAnswerValue(value: unknown) {
  const raw = toCellString(value).replace(/\s+/g, "");

  if (!raw || raw === "-") {
    return "";
  }

  return raw.replace(/\.0$/, "").toUpperCase();
}

function parseScoreNumber(value: unknown) {
  const raw = toCellString(value).replace(/,/g, "");

  if (!raw || raw === "-") {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentNumber(value: unknown) {
  const raw = toCellString(value).replace(/,/g, "").replace(/%/g, "").trim();

  if (!raw || raw === "-") {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function findSheetName(sheetNames: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase());

  return (
    sheetNames.find((sheetName) =>
      normalizedCandidates.includes(sheetName.replace(/\s+/g, "").toLowerCase()),
    ) ?? sheetNames[0]
  );
}

function findColumnIndex(headers: Array<unknown>, synonyms: string[]) {
  const normalizedSynonyms = synonyms.map((synonym) => synonym.replace(/\s+/g, "").toLowerCase());

  return headers.findIndex((header) => {
    const normalized = normalizeHeader(header);
    return normalizedSynonyms.some((synonym) => normalized.includes(synonym));
  });
}

function ensureColumnIndex(headers: Array<unknown>, synonyms: string[], label: string) {
  const index = findColumnIndex(headers, synonyms);

  if (index === -1) {
    throw new Error(`${label} 열을 찾을 수 없습니다.`);
  }

  return index;
}

function bufferToUtf8String(buffer: Buffer | ArrayBuffer) {
  return Buffer.isBuffer(buffer) ? buffer.toString("utf8") : Buffer.from(buffer).toString("utf8");
}

function htmlBufferToRows(buffer: Buffer | ArrayBuffer): TableRows {
  const html = bufferToUtf8String(buffer);
  const $ = load(html);
  const table = $("table").first();

  if (!table.length) {
    throw new Error("HTML 테이블을 찾을 수 없습니다.");
  }

  return table
    .find("tr")
    .toArray()
    .map((row) =>
      $(row)
        .find("th,td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\u00a0/g, " ").trim()),
    )
    .filter((row) => row.some((cell) => cell !== ""));
}

function maybeHtmlRows(buffer: Buffer | ArrayBuffer) {
  const html = bufferToUtf8String(buffer);

  if (html.includes("<table")) {
    return htmlBufferToRows(buffer);
  }

  const workbook = readWorkbookFromBuffer(buffer);
  const sheetName = workbook.SheetNames[0];
  return getSheetRows(workbook, sheetName).map((row) => row.map((value) => toCellString(value)));
}


function inferCorrectedExamNumber(row: Array<unknown>, correctedIndex: number, examIndex: number) {
  return normalizeExamNumber(row[correctedIndex]) ?? normalizeExamNumber(row[examIndex]);
}

function detectAnswerStartIndex(headers: Array<unknown>) {
  const index = headers.findIndex((header) => {
    const normalized = normalizeHeader(header);
    return /^\d+(\.0)?$/.test(normalized);
  });

  if (index === -1) {
    throw new Error("답안 열 시작 위치를 찾을 수 없습니다.");
  }

  return index;
}

function looksLikeAnswerKeyRow(row: Array<unknown>, answerStartIndex: number, examIndex: number) {
  if (normalizeExamNumber(row[examIndex])) {
    return false;
  }

  const answers = row
    .slice(answerStartIndex)
    .map((value) => normalizeAnswerValue(value))
    .filter(Boolean);

  if (answers.length < 5) {
    return false;
  }

  const oxOnly = answers.every((answer) => answer === "O" || answer === "X");
  return !oxOnly;
}

function buildOfflineAnswerBundle(rows: Array<Array<unknown>>) {
  if (rows.length <= 1) {
    return {
      questions: [] as ParsedQuestionRecord[],
      answers: [] as ParsedAnswerRecord[],
    };
  }

  const headers = rows[0] ?? [];
  const answerStartIndex = detectAnswerStartIndex(headers);
  // errata 시트 자체 헤더에서 수험번호 컬럼 탐색 (score 시트와 컬럼 순서가 다를 수 있음)
  const examIndex = findColumnIndex(headers, ["학번", "수험번호", "응시번호"]);

  if (examIndex === -1) {
    return {
      questions: [] as ParsedQuestionRecord[],
      answers: [] as ParsedAnswerRecord[],
    };
  }

  const answerKeyRowIndex = rows.findIndex((row, index) =>
    index > 0 && looksLikeAnswerKeyRow(row, answerStartIndex, examIndex),
  );

  if (answerKeyRowIndex === -1) {
    return {
      questions: [] as ParsedQuestionRecord[],
      answers: [] as ParsedAnswerRecord[],
    };
  }

  const answerKeyRow = rows[answerKeyRowIndex] ?? [];
  const questions = answerKeyRow.slice(answerStartIndex).map((value, index) => ({
    questionNo: index + 1,
    correctAnswer: normalizeAnswerValue(value),
    correctRate: null,
    answerDistribution: null,
    difficulty: null,
  }));

  const answers = rows
    .slice(1)
    .filter((row, index) => index + 1 !== answerKeyRowIndex)
    .flatMap((row) => {
      const examNumber = normalizeExamNumber(row[examIndex]);

      if (!examNumber) {
        return [];
      }

      return row.slice(answerStartIndex).flatMap((value, index) => {
        const answer = normalizeAnswerValue(value);

        if (!answer) {
          return [];
        }

        return {
          studentKey: examNumber,
          questionNo: index + 1,
          answer,
        } satisfies ParsedAnswerRecord;
      });
    });

  return {
    questions: questions.filter((question) => question.correctAnswer),
    answers,
  };
}

function splitOfflineBundle(bundle: {
  questions: ParsedQuestionRecord[];
  answers: ParsedAnswerRecord[];
}) {
  const mcqQuestions = bundle.questions.filter(
    (q) => q.correctAnswer !== "O" && q.correctAnswer !== "X",
  );
  const mcqQuestionNos = new Set(mcqQuestions.map((q) => q.questionNo));

  const oxQuestionsRaw = bundle.questions.filter(
    (q) => q.correctAnswer === "O" || q.correctAnswer === "X",
  );
  const oxQuestionNos = new Set(oxQuestionsRaw.map((q) => q.questionNo));
  const oxQuestions = oxQuestionsRaw.map((q) => ({ ...q }));

  const mcqAnswers = bundle.answers.filter((a) => mcqQuestionNos.has(a.questionNo));
  const oxAnswers = bundle.answers
    .filter((a) => oxQuestionNos.has(a.questionNo))
    .map((a) => ({ ...a }));

  return {
    main: { questions: mcqQuestions, answers: mcqAnswers },
    ox: { questions: oxQuestions, answers: oxAnswers },
  };
}

export function parseOfflineAnalysisQuestions(input: {
  fileName: string;
  buffer: Buffer | ArrayBuffer;
}) {
  const workbook = readWorkbookFromBuffer(input.buffer);
  const sheetName =
    workbook.SheetNames.find((name) =>
      name.replace(/\s+/g, "").toLowerCase().includes("moon"),
    ) ?? workbook.SheetNames[0];

  if (!sheetName) {
    return [] as ParsedQuestionRecord[];
  }

  const rows = getSheetRows(workbook, sheetName);
  const headerRowIndex = rows.findIndex(
    (row, index) =>
      index < 10 &&
      normalizeHeader(row[0]).includes("\uBB38\uD56D\uBC88\uD638") &&
      row.some((cell) =>
        ["1", "2", "3", "4", "\uAE30\uD0C0", "o", "x"].includes(
          toCellString(cell).trim().toLowerCase(),
        ),
      ),
  );

  if (headerRowIndex === -1) {
    return [] as ParsedQuestionRecord[];
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const questionNoIndex = 0;
  const correctAnswerIndex = 1;
  const correctRateIndex = findColumnIndex(headerRow, ["\uC815\uB2F5\uB960(%)", "\uC815\uB2F5\uB960"]);
  const distributionColumns = headerRow
    .map((cell, index) => ({
      index,
      label: toCellString(cell).trim(),
    }))
    .filter(({ label }) => ["1", "2", "3", "4", "\uAE30\uD0C0", "O", "X", "o", "x"].includes(label));

  return rows
    .slice(headerRowIndex + 1)
    .flatMap((row) => {
      const questionNo = Number.parseInt(toCellString(row[questionNoIndex]), 10);
      const correctAnswer = normalizeAnswerValue(row[correctAnswerIndex]);

      if (!Number.isFinite(questionNo) || !correctAnswer) {
        return [];
      }

      const answerDistributionEntries = distributionColumns
        .map(({ index, label }) => {
          const percent = parsePercentNumber(row[index]);

          if (percent === null) {
            return null;
          }

          const normalizedLabel = normalizeAnswerValue(label) || label;
          return [normalizedLabel, percent] as const;
        })
        .filter((entry): entry is readonly [string, number] => Boolean(entry));

      return {
        questionNo,
        correctAnswer,
        correctRate:
          correctRateIndex === -1 ? null : parsePercentNumber(row[correctRateIndex]),
        answerDistribution:
          answerDistributionEntries.length > 0
            ? Object.fromEntries(answerDistributionEntries)
            : null,
        difficulty: null,
      } satisfies ParsedQuestionRecord;
    });
}

function parseIdentifierCell(value: string) {
  const match = value.trim().match(/^(.*?)(?:\((.*)\))?$/);

  if (!match) {
    return {
      onlineId: value.trim() || null,
      name: null,
    };
  }

  const [, rawOnlineId, rawName] = match;
  const onlineId = rawOnlineId.trim() || null;
  const name = rawName?.trim() || null;

  return {
    onlineId,
    name,
  };
}

function buildOnlineDetailBundle(
  rows: TableRows,
  baseOffset = 0,
) {
  const identifiers = rows[1] ?? [];
  const questionRows = rows.slice(2).filter((row) => row.some((cell) => cell !== ""));

  const students = identifiers.slice(3).map((cell, index) => ({
    ...parseIdentifierCell(cell),
    columnIndex: index + 3,
  }));

  const questions: ParsedQuestionRecord[] = [];
  const answers: ParsedAnswerRecord[] = [];

  for (const row of questionRows) {
    const questionNoValue = Number.parseInt(toCellString(row[1]), 10);
    const questionNo = Number.isFinite(questionNoValue)
      ? baseOffset + questionNoValue
      : baseOffset + questions.length + 1;
    const correctAnswer = normalizeAnswerValue(row[2]);

    if (!correctAnswer) {
      continue;
    }

    questions.push({
      questionNo,
      correctAnswer,
      correctRate: null,
      answerDistribution: null,
      difficulty: null,
    });

    for (const student of students) {
      if (!student.onlineId) {
        continue;
      }

      const answer = normalizeAnswerValue(row[student.columnIndex]);

      if (!answer) {
        continue;
      }

      answers.push({
        studentKey: student.onlineId,
        questionNo,
        answer,
      });
    }
  }

  return {
    questions,
    answers,
  };
}

export function parseOfflineScoreImport(input: {
  fileName: string;
  buffer: Buffer | ArrayBuffer;
  attendType?: AttendType;
}): ParsedOfflineScoreImport {
  const workbook = readWorkbookFromBuffer(input.buffer);
  const scoreSheetName = findSheetName(workbook.SheetNames, OFFLINE_SCORE_SHEET_NAMES);
  const errataSheetName =
    workbook.SheetNames.length > 1
      ? findSheetName(workbook.SheetNames, OFFLINE_ERRATA_SHEET_NAMES)
      : null;
  const scoreRows = getSheetRows(workbook, scoreSheetName);
  const headers = scoreRows[0] ?? [];
  const examIndex = ensureColumnIndex(headers, ["학번", "수험번호", "응시번호"], "수험번호");
  const correctedIndex = findColumnIndex(headers, ["학번(정정)", "수험번호(정정)", "정정수험번호"]);
  const nameIndex = findColumnIndex(headers, ["성명", "이름", "응시자명"]);
  const rawIndex = findColumnIndex(headers, ["원점수", "객관식", "점수"]);
  const finalIndex = findColumnIndex(headers, ["최종점수", "총점", "합계"]);
  const oxIndex = findColumnIndex(headers, ["주관식추가점수", "ox점수", "가산점", "주관식"]);

  const allRows = scoreRows.slice(1).map((row, index) => {
    const examNumber =
      correctedIndex === -1
        ? normalizeExamNumber(row[examIndex])
        : inferCorrectedExamNumber(row, correctedIndex, examIndex);
    const name = nameIndex === -1 ? "" : toCellString(row[nameIndex]);
    const rawScore = rawIndex === -1 ? null : parseScoreNumber(row[rawIndex]);
    const oxScoreValue =
      oxIndex === -1 || oxIndex === finalIndex ? null : parseScoreNumber(row[oxIndex]);

    return { examNumber, name, rawScore, oxScoreValue, rowIndex: index };
  });

  const validBase = allRows.filter((r) => Boolean(r.examNumber || r.name));

  // 객관식(MCQ) 성적: rawScore만 저장, 100점 만점
  const records: ParsedScoreRecord[] = validBase
    .filter((r) => r.rawScore !== null)
    .map((r) => ({
      rowKey: `offline:${r.rowIndex + 2}`,
      rowNumber: r.rowIndex + 2,
      examNumber: r.examNumber,
      name: r.name,
      onlineId: null,
      rawScore: r.rawScore,
      oxScore: null,
      finalScore: r.rawScore,
      attendType: input.attendType ?? AttendType.NORMAL,
      sourceType: ScoreSource.OFFLINE_UPLOAD,
      note: null,
    }));

  // 경찰학 OX 성적: 별도 세션에 저장, 100점 만점
  const oxRecords: ParsedScoreRecord[] = validBase.flatMap((r) =>
    r.oxScoreValue === null
      ? []
      : [
          {
            rowKey: `offline-ox:${r.rowIndex + 2}`,
            rowNumber: r.rowIndex + 2,
            examNumber: r.examNumber,
            name: r.name,
            onlineId: null,
            rawScore: null,
            oxScore: r.oxScoreValue,
            finalScore: r.oxScoreValue,
            attendType: input.attendType ?? AttendType.NORMAL,
            sourceType: ScoreSource.OFFLINE_UPLOAD,
            note: null,
          } satisfies ParsedScoreRecord,
        ],
  );

  const errataRows = errataSheetName ? getSheetRows(workbook, errataSheetName) : [];
  const bundle =
    errataRows.length > 0
      ? buildOfflineAnswerBundle(errataRows)
      : { questions: [] as ParsedQuestionRecord[], answers: [] as ParsedAnswerRecord[] };

  const split = splitOfflineBundle(bundle);

  return {
    sourceType: ScoreSource.OFFLINE_UPLOAD,
    matchingKey: "examNumber",
    records,
    oxRecords,
    questions: split.main.questions,
    answers: split.main.answers,
    oxQuestions: split.ox.questions,
    oxAnswers: split.ox.answers,
    metadata: {
      fileName: input.fileName,
      scoreSheetName,
      errataSheetName,
    },
  };
}

function parseOnlineScoreRows(rows: TableRows) {
  const headers = rows[0] ?? [];
  const onlineIdIndex = ensureColumnIndex(headers, ONLINE_SCORE_ID_HEADERS, "온라인 ID");
  const nameIndex = ensureColumnIndex(headers, ["이름", "응시자명", "성명"], "이름");
  const scoreIndex = ensureColumnIndex(headers, ["점수", "원점수"], "점수");

  return rows.slice(1).map((row, index) => ({
    rowKey: `online:${index + 2}`,
    rowNumber: index + 2,
    onlineId: toCellString(row[onlineIdIndex]) || null,
    name: toCellString(row[nameIndex]),
    score: parseScoreNumber(row[scoreIndex]),
    registeredAt: toCellString(row[findColumnIndex(headers, ["등록일", "응시시간"])]) || null,
  }));
}

export function parseOnlineScoreImport(input: {
  mainFileName: string;
  mainBuffer: Buffer | ArrayBuffer;
  detailFileName?: string;
  detailBuffer?: Buffer | ArrayBuffer;
  attendType?: AttendType;
}) {
  const mainRows = maybeHtmlRows(input.mainBuffer);
  const mainRecords = parseOnlineScoreRows(mainRows);

  // 온라인 객관식: rawScore = 파일 점수, 100점 만점 (OX는 별도 세션에 별도 업로드)
  const records = mainRecords
    .map((record) => ({
      rowKey: record.rowKey,
      rowNumber: record.rowNumber,
      examNumber: null,
      name: record.name,
      onlineId: record.onlineId,
      rawScore: record.score,
      oxScore: null,
      finalScore: record.score,
      attendType: input.attendType ?? AttendType.LIVE,
      sourceType: ScoreSource.ONLINE_UPLOAD,
      note: null,
    }))
    .filter(
      (record) =>
        Boolean(record.onlineId || record.name) &&
        record.rawScore !== null,
    );

  const detailBundle =
    input.detailBuffer && input.detailFileName
      ? buildOnlineDetailBundle(maybeHtmlRows(input.detailBuffer))
      : { questions: [] as ParsedQuestionRecord[], answers: [] as ParsedAnswerRecord[] };

  return {
    sourceType: ScoreSource.ONLINE_UPLOAD,
    matchingKey: "onlineId",
    records,
    questions: detailBundle.questions,
    answers: detailBundle.answers,
    metadata: {
      mainFileName: input.mainFileName,
      detailFileName: input.detailFileName ?? null,
    },
  } satisfies ParsedScoreImport;
}

export function parseOnlineOxScoreImport(input: {
  mainFileName: string;
  mainBuffer: Buffer | ArrayBuffer;
  detailFileName?: string;
  detailBuffer?: Buffer | ArrayBuffer;
  attendType?: AttendType;
}) {
  const mainRows = maybeHtmlRows(input.mainBuffer);
  const mainRecords = parseOnlineScoreRows(mainRows);

  const records = mainRecords
    .map((record) => ({
      rowKey: `${record.rowKey}:ox`,
      rowNumber: record.rowNumber,
      examNumber: null,
      name: record.name,
      onlineId: record.onlineId,
      rawScore: null,
      oxScore: record.score,
      finalScore: record.score,
      attendType: input.attendType ?? AttendType.LIVE,
      sourceType: ScoreSource.ONLINE_UPLOAD,
      note: null,
    }))
    .filter(
      (record) =>
        Boolean(record.onlineId || record.name) &&
        record.oxScore !== null,
    );

  const detailBundle =
    input.detailBuffer && input.detailFileName
      ? buildOnlineDetailBundle(maybeHtmlRows(input.detailBuffer), 20)
      : { questions: [] as ParsedQuestionRecord[], answers: [] as ParsedAnswerRecord[] };

  return {
    sourceType: ScoreSource.ONLINE_UPLOAD,
    matchingKey: "onlineId",
    records,
    questions: detailBundle.questions,
    answers: detailBundle.answers,
    metadata: {
      mainFileName: input.mainFileName,
      detailFileName: input.detailFileName ?? null,
      isOxImport: true,
    },
  } satisfies ParsedScoreImport;
}

function parseAttendType(value: string | undefined, fallback: AttendType) {
  const normalized = (value ?? "").trim().toUpperCase();

  if (normalized === "LIVE" || normalized === "온라인") {
    return AttendType.LIVE;
  }

  if (normalized === "EXCUSED" || normalized === "사유") {
    return AttendType.EXCUSED;
  }

  if (normalized === "ABSENT" || normalized === "결시" || normalized === "불참") {
    return AttendType.ABSENT;
  }

  return fallback;
}

export function parseScorePasteImport(input: {
  text: string;
  attendType?: AttendType;
}) {
  const rows = input.text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.split("\t"));

  const records = rows.map((values, index) => {
    // 7열 형식: 수험번호|성명|응시분야|지원지역|생년월일|원점수[|무시]
    // 기존 형식: 수험번호|이름|원점수[|응시유형]
    // OX 성적은 별도 세션을 선택하여 따로 입력 (합산 없음)
    const isSevenColumnFormat = values.length >= 6;

    let rawScore: number | null;
    let attendType: AttendType;

    if (isSevenColumnFormat) {
      rawScore = parseScoreNumber(values[5]);
      attendType = input.attendType ?? AttendType.NORMAL;
    } else {
      const fourthValue = values[3]?.trim();
      rawScore = parseScoreNumber(values[2]);
      attendType = parseAttendType(fourthValue, input.attendType ?? AttendType.NORMAL);
    }

    return {
      rowKey: `paste:${index + 1}`,
      rowNumber: index + 1,
      examNumber: normalizeExamNumber(values[0]),
      name: toCellString(values[1]),
      onlineId: null,
      rawScore,
      oxScore: null,
      finalScore: rawScore,
      attendType,
      sourceType: ScoreSource.PASTE_INPUT,
      note: null,
    } satisfies ParsedScoreRecord;
  });

  return {
    sourceType: ScoreSource.PASTE_INPUT,
    matchingKey: "examNumber",
    records: records.filter(
      (record) =>
        Boolean(record.examNumber || record.name) && record.rawScore !== null,
    ),
    questions: [] as ParsedQuestionRecord[],
    answers: [] as ParsedAnswerRecord[],
    metadata: {
      lineCount: rows.length,
    },
  } satisfies ParsedScoreImport;
}
