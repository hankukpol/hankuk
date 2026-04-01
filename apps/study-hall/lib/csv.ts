export type CsvCell = string | number | null | undefined;
export type DelimitedFileDelimiter = "," | ";" | "\t";

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function escapeDelimitedCell(value: CsvCell, delimiter: Exclude<DelimitedFileDelimiter, "\t">) {
  const text = value == null ? "" : String(value);

  if (!text.includes(delimiter) && !/[\"\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function buildDelimitedLine(
  cells: CsvCell[],
  delimiter: Exclude<DelimitedFileDelimiter, "\t"> = ",",
) {
  return cells.map((cell) => escapeDelimitedCell(cell, delimiter)).join(delimiter);
}

export function buildExcelFriendlyCsv(
  lines: string[],
  delimiter: Exclude<DelimitedFileDelimiter, "\t"> = ",",
) {
  return [`sep=${delimiter}`, ...lines].join("\r\n");
}

function encodeUtf8WithBom(value: string) {
  const payload = new TextEncoder().encode(value);
  const buffer = new Uint8Array(3 + payload.length);
  buffer[0] = 0xef;
  buffer[1] = 0xbb;
  buffer[2] = 0xbf;
  buffer.set(payload, 3);
  return buffer;
}

function decodeUtf16Be(bytes: Uint8Array) {
  const swapped = new Uint8Array(bytes.length);

  for (let index = 0; index < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1] ?? 0;
    swapped[index + 1] = bytes[index] ?? 0;
  }

  return new TextDecoder("utf-16le").decode(swapped);
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([encodeUtf8WithBom(content)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readTextFileWithEncoding(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16Be(bytes.subarray(2));
  }

  const utf8Text = new TextDecoder("utf-8").decode(bytes);
  if (!utf8Text.includes("�")) {
    return utf8Text;
  }

  try {
    const eucKrText = new TextDecoder("euc-kr").decode(bytes);
    if (!eucKrText.includes("�")) {
      return eucKrText;
    }
  } catch {
    // Ignore unsupported decoder labels and fall back to UTF-8 output.
  }

  return utf8Text;
}

export function inferDelimitedFileDelimiter(text: string): DelimitedFileDelimiter {
  const lines = text
    .split(/\r?\n/)
    .map((line) => stripBom(line).trim())
    .filter(Boolean);

  const separatorDirective = lines.find((line) => line.toLowerCase().startsWith("sep="));
  const declaredDelimiter = separatorDirective?.slice(4, 5);

  if (declaredDelimiter === "," || declaredDelimiter === ";" || declaredDelimiter === "\t") {
    return declaredDelimiter;
  }

  const firstDataLine = lines.find((line) => !line.toLowerCase().startsWith("sep="));
  if (!firstDataLine) {
    return ",";
  }

  if (firstDataLine.includes("\t") && !firstDataLine.includes(",") && !firstDataLine.includes(";")) {
    return "\t";
  }

  if (firstDataLine.includes(";") && !firstDataLine.includes(",")) {
    return ";";
  }

  return ",";
}

export function parseDelimitedLine(
  line: string,
  delimiter: DelimitedFileDelimiter = ",",
) {
  const normalizedLine = stripBom(line.replace(/\r$/, ""));

  if (delimiter === "\t") {
    return normalizedLine.split("\t").map((cell) => cell.trim());
  }

  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < normalizedLine.length; index += 1) {
    const character = normalizedLine[index];

    if (character === '"') {
      if (inQuotes && normalizedLine[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}
