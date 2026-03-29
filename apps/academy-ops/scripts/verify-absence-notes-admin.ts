import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function assertIncludes(source: string, fragment: string, label: string) {
  assert.ok(source.includes(fragment), `${label} is missing: ${fragment}`);
}

function assertNotIncludes(source: string, fragment: string, label: string) {
  assert.ok(!source.includes(fragment), `${label} still contains: ${fragment}`);
}

function main() {
  const page = read("src/app/admin/absence-notes/page.tsx");
  const manager = read("src/components/absence-notes/absence-note-manager.tsx");
  const service = read("src/lib/absence-notes/service.ts");
  const noteRoute = read("src/app/api/absence-notes/[id]/route.ts");
  const attachmentRoute = read("src/app/api/absence-notes/[id]/attachments/route.ts");
  const attachmentDeleteRoute = read(
    "src/app/api/absence-notes/[id]/attachments/[attachmentId]/route.ts",
  );

  assertIncludes(page, "사유서 등록 중심으로 흐름을 다시 정리했습니다.", "page heading");
  assertIncludes(page, "AbsenceNoteFilterPresetControls", "page preset controls");
  assertIncludes(page, "DateRangePicker", "page date range picker");
  assertIncludes(page, "사유서 조회 및 검토", "page review section");

  assertIncludes(manager, 'title: "회차를 변경할까요?"', "manager change-session modal");
  assertIncludes(manager, 'title: "승인을 취소할까요?"', "manager revert modal");
  assertIncludes(manager, 'title: "사유서를 삭제할까요?"', "manager delete modal");
  assertIncludes(manager, 'confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}', "manager confirm fallback");
  assertIncludes(manager, 'confirmLabel={completionModal.modal?.confirmLabel ?? "확인"}', "manager completion fallback");
  assert.ok(!/\uFFFD/.test(manager), "manager still contains replacement characters");

  assertIncludes(service, 'export const ABSENCE_ATTACHMENT_EMPTY_MESSAGE = "첨부 파일을 선택해 주세요.";', "service attachment empty message");
  assertIncludes(service, 'export const ABSENCE_ATTACHMENT_LOCKED_MESSAGE = "승인 완료된 사유서는 첨부를 수정할 수 없습니다.";', "service attachment locked message");
  assertIncludes(service, 'throw new Error("수험번호를 입력해 주세요.");', "service exam number message");
  assertIncludes(service, 'throw new Error("유효한 회차를 선택해 주세요.");', "service session message");
  assertIncludes(service, 'throw new Error("사유 내용을 입력해 주세요.");', "service reason message");
  assertIncludes(service, 'throw new Error("같은 회차로는 변경할 수 없습니다.");', "service change-session same target");
  assertIncludes(service, 'throw new Error("이미 같은 학생의 사유서가 있는 회차로는 변경할 수 없습니다.");', "service change-session conflict");
  assert.ok(!/\uFFFD/.test(service), "service still contains replacement characters");

  assertIncludes(noteRoute, 'error instanceof Error ? error.message : "사유서 처리에 실패했습니다."', "note route fallback");
  assertIncludes(attachmentRoute, 'const status = message === ABSENCE_ATTACHMENT_LOCKED_MESSAGE ? 409 : 400;', "attachment upload locked status");
  assertIncludes(attachmentDeleteRoute, 'const status = message === ABSENCE_ATTACHMENT_LOCKED_MESSAGE ? 409 : 400;', "attachment delete locked status");

  console.log("verify:absence-notes-admin ok");
}

main();