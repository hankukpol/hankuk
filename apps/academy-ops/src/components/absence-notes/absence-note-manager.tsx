"use client";

import {
  AbsenceCategory,
  AbsenceStatus,
  StudentStatus,
  Subject,
} from "@prisma/client";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/analytics/presentation";
import {
  ABSENCE_CATEGORY_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { AbsenceNoteAttachmentPanel, type AbsenceNoteAttachmentRecord } from "@/components/absence-notes/absence-note-attachment-panel";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { formatDate, formatDateTime, todayDateInputValue } from "@/lib/format";
import { useEffect, useRef, useMemo, useState, useTransition } from "react";

type SessionOption = {
  id: number;
  examDate: string;
  subject: Subject;
  week: number;
};

type StudentOption = {
  examNumber: string;
  name: string;
  currentStatus: StudentStatus;
};

type AbsenceNoteRecord = {
  id: number;
  examNumber: string;
  sessionId: number;
  reason: string;
  absenceCategory: AbsenceCategory | null;
  submittedAt: string | null;
  approvedAt: string | null;
  status: AbsenceStatus;
  attendCountsAsAttendance: boolean;
  attendGrantsPerfectAttendance: boolean;
  adminNote: string | null;
  student: {
    name: string;
    currentStatus: StudentStatus;
  };
  session: {
    examDate: string;
    week: number;
    subject: Subject;
    period: {
      name: string;
    };
  };
  attachments: AbsenceNoteAttachmentRecord[];
};

type SortColumn = "examNumber" | "status" | "absenceCategory" | "examDate" | "submittedAt" | "attendCountsAsAttendance" | "attendGrantsPerfectAttendance";

type AbsencePolicyOption = {
  id: number;
  name: string;
  absenceCategory: AbsenceCategory;
  attendCountsAsAttendance: boolean;
  attendGrantsPerfectAttendance: boolean;
  isActive: boolean;
  sortOrder: number;
};

type AbsenceNoteManagerProps = {
  students: StudentOption[];
  sessions: SessionOption[];
  policies: AbsencePolicyOption[];
  notes: AbsenceNoteRecord[];
  settingsHref?: string;
  showCreateSection?: boolean;
  showReviewSection?: boolean;
  showGuidanceSection?: boolean;
};

const NOTE_STATUS_LABEL: Record<AbsenceStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

const NOTE_STATUS_CLASS: Record<AbsenceStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_SORT_ORDER: Record<AbsenceStatus, number> = {
  PENDING: 0,
  REJECTED: 1,
  APPROVED: 2,
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const PAGE_SIZE = 20;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function getAttachmentFileKey(file: File) {
  return `${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
}

function validateAttachmentFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension = ATTACHMENT_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );

  if (!hasSupportedExtension) {
    return `${file.name}: PDF, JPG, JPEG, PNG 파일만 첨부할 수 있습니다.`;
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name}: 5MB 이하 파일만 첨부할 수 있습니다.`;
  }

  return null;
}

function mergeAttachmentFiles(currentFiles: File[], nextFiles: FileList | null) {
  const merged = [...currentFiles];
  const keys = new Set(currentFiles.map((file) => getAttachmentFileKey(file)));
  const errors: string[] = [];

  for (const file of Array.from(nextFiles ?? [])) {
    const error = validateAttachmentFile(file);
    if (error) {
      errors.push(error);
      continue;
    }

    const key = getAttachmentFileKey(file);
    if (keys.has(key)) {
      continue;
    }

    keys.add(key);
    merged.push(file);
  }

  return {
    files: merged,
    errors,
  };
}

function booleanFromFormData(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function getSessionDateKey(session: SessionOption) {
  return formatDate(session.examDate);
}

function findFirstSessionIdByDate(sessions: SessionOption[], dateKey: string) {
  return sessions.find((session) => getSessionDateKey(session) === dateKey)?.id ?? null;
}

function SortIcon({ column, sortBy, sortOrder }: { column: SortColumn; sortBy: SortColumn; sortOrder: "asc" | "desc" }) {
  if (sortBy !== column) return <span className="ml-1 text-ink/20">⇅</span>;
  return <span className="ml-1 text-ember">{sortOrder === "asc" ? "↑" : "↓"}</span>;
}

export function AbsenceNoteManager({
  students,
  sessions,
  policies,
  notes,
  settingsHref,
  showCreateSection = true,
  showReviewSection = true,
  showGuidanceSection = true,
}: AbsenceNoteManagerProps) {
  const todayKey = todayDateInputValue();
  const shouldShowCreateSection = showCreateSection;
  const shouldShowReviewSection = showReviewSection;
  const shouldShowGuidanceSection = showGuidanceSection;
  // ── 공통 등록 폼 상태 ──────────────────────────────────────
  const [createExamNumber, setCreateExamNumber] = useState(students[0]?.examNumber ?? "");
  const [studentSearch, setStudentSearch] = useState("");
  const [createCategory, setCreateCategory] = useState<AbsenceCategory>(AbsenceCategory.OTHER);
  const [createReason, setCreateReason] = useState("");
  const [createAdminNote, setCreateAdminNote] = useState("");
  const [createAttachments, setCreateAttachments] = useState<File[]>([]);
  const [createCountsAsAttendance, setCreateCountsAsAttendance] = useState(false);
  const [createPerfectAttendance, setCreatePerfectAttendance] = useState(false);
  const [createPolicyId, setCreatePolicyId] = useState("");

  // ── 단건 등록 ────────────────────────────────────────────
  const [createDateFilter, setCreateDateFilter] = useState(todayKey);
  const [createSessionId, setCreateSessionId] = useState(() => {
    const sessionId = findFirstSessionIdByDate(sessions, todayKey);
    return sessionId ? String(sessionId) : "";
  });

  // ── 등록 모드: 단건 / 일괄 ────────────────────────────────
  const [createMode, setCreateMode] = useState<"single" | "bulk">("single");

  // ── 일괄 등록 상태 ────────────────────────────────────────
  const [bulkSubMode, setBulkSubMode] = useState<"pick" | "weekday">("pick");
  const [bulkDateFrom, setBulkDateFrom] = useState(todayKey);
  const [bulkDateTo, setBulkDateTo] = useState(todayKey);
  const [bulkWeekdays, setBulkWeekdays] = useState<number[]>([]);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([]);

  // ── 드로어 회차 변경 상태 ─────────────────────────────────
  const [changeSessionDateFilter, setChangeSessionDateFilter] = useState(todayKey);
  const [changeSessionTargetId, setChangeSessionTargetId] = useState<string>(() => {
    const sessionId = findFirstSessionIdByDate(sessions, todayKey);
    return sessionId ? String(sessionId) : "";
  });

  // ── 공통 UI 상태 ──────────────────────────────────────────
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const completionModal = useActionModalState();
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [selectedNote, setSelectedNote] = useState<AbsenceNoteRecord | null>(null);
  const [drawerAttachments, setDrawerAttachments] = useState<File[]>([]);
  const drawerFormRef = useRef<HTMLFormElement>(null);

  // ── 정렬 / 페이지 ─────────────────────────────────────────
  const [sortBy, setSortBy] = useState<SortColumn>("status");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // ── 단건 등록 필터 ────────────────────────────────────────
  const filteredSessions = useMemo(() => {
    if (!createDateFilter) return sessions;
    return sessions.filter((s) => getSessionDateKey(s) === createDateFilter);
  }, [sessions, createDateFilter]);
  const searchedStudents = useMemo(() => {
    const keyword = studentSearch.trim();
    if (!keyword) return students;
    return students.filter(
      (student) =>
        student.examNumber.includes(keyword) || student.name.includes(keyword),
    );
  }, [studentSearch, students]);
  const hasSelectedCreateSession = filteredSessions.some((session) => String(session.id) === createSessionId);

  useEffect(() => {
    if (filteredSessions.length === 0) {
      if (createSessionId !== "") {
        setCreateSessionId("");
      }
      return;
    }

    if (!filteredSessions.some((session) => String(session.id) === createSessionId)) {
      setCreateSessionId(String(filteredSessions[0].id));
    }
  }, [createSessionId, filteredSessions]);

  useEffect(() => {
    if (createMode === "bulk" && createAttachments.length > 0) {
      setCreateAttachments([]);
    }
  }, [createAttachments.length, createMode]);

  useEffect(() => {
    setDrawerAttachments([]);
  }, [selectedNote?.id]);

  const isWeekdayBulkReady = Boolean(bulkDateFrom) && Boolean(bulkDateTo) && bulkWeekdays.length > 0;

  // ── 일괄 등록: 조건에 맞는 세션 목록 ─────────────────────
  const bulkFilteredSessions = useMemo(() => {
    if (bulkSubMode === "weekday" && !isWeekdayBulkReady) {
      return [];
    }

    return sessions.filter((s) => {
      const date = getSessionDateKey(s);
      if (bulkDateFrom && date < bulkDateFrom) return false;
      if (bulkDateTo && date > bulkDateTo) return false;
      if (bulkSubMode === "weekday") {
        const dow = new Date(`${date}T00:00:00`).getDay();
        if (!bulkWeekdays.includes(dow)) return false;
      }
      return true;
    });
  }, [sessions, bulkDateFrom, bulkDateTo, bulkSubMode, bulkWeekdays, isWeekdayBulkReady]);

  const bulkFilteredSessionIds = useMemo(
    () => new Set(bulkFilteredSessions.map((s) => s.id)),
    [bulkFilteredSessions],
  );

  // pick 모드일 때는 bulkSelectedIds 사용, weekday/range 모드는 자동 선택
  const effectiveSessionIds = useMemo(() => {
    if (bulkSubMode === "pick") {
      return bulkSelectedIds.filter((id) => bulkFilteredSessionIds.has(id));
    }
    return bulkFilteredSessions.map((s) => s.id);
  }, [bulkSubMode, bulkSelectedIds, bulkFilteredSessionIds, bulkFilteredSessions]);

  // ── 드로어 회차 변경: 날짜 필터 세션 목록 ────────────────
  const changeSessionOptions = useMemo(() => {
    if (!changeSessionDateFilter) return sessions;
    return sessions.filter((s) => getSessionDateKey(s) === changeSessionDateFilter);
  }, [sessions, changeSessionDateFilter]);

  useEffect(() => {
    if (changeSessionOptions.length === 0) {
      if (changeSessionTargetId !== "") {
        setChangeSessionTargetId("");
      }
      return;
    }

    if (!changeSessionOptions.some((session) => String(session.id) === changeSessionTargetId)) {
      setChangeSessionTargetId(String(changeSessionOptions[0].id));
    }
  }, [changeSessionOptions, changeSessionTargetId]);

  // ── 정렬된 노트 ───────────────────────────────────────────
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "examNumber":
          cmp = a.examNumber.localeCompare(b.examNumber);
          break;
        case "status":
          cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
          if (cmp === 0) cmp = b.session.examDate.localeCompare(a.session.examDate);
          break;
        case "absenceCategory":
          cmp = (a.absenceCategory ?? "").localeCompare(b.absenceCategory ?? "");
          break;
        case "examDate":
          cmp = a.session.examDate.localeCompare(b.session.examDate);
          break;
        case "submittedAt":
          cmp = (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "");
          break;
        case "attendCountsAsAttendance":
          cmp = Number(b.attendCountsAsAttendance) - Number(a.attendCountsAsAttendance);
          break;
        case "attendGrantsPerfectAttendance":
          cmp = Number(b.attendGrantsPerfectAttendance) - Number(a.attendGrantsPerfectAttendance);
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [notes, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedNotes.length / PAGE_SIZE));
  const paginatedNotes = sortedNotes.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginatedSelectableIds = paginatedNotes
    .filter((note) => note.status !== AbsenceStatus.APPROVED)
    .map((note) => note.id);

  useEffect(() => {
    setSelectedNoteIds([]);
  }, [currentPage, sortBy, sortOrder]);

  function toggleSort(column: SortColumn) {
    if (sortBy === column) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  }

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
    return payload;
  }

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNotice(nextNotice);
    setErrorMessage(nextError);
  }

  function reloadPage(message: string, title = "작업 완료", details: string[] = []) {
    setNotice(null);
    setErrorMessage(null);
    completionModal.openModal({
      badgeLabel: "완료",
      badgeTone: "success",
      title,
      description: message,
      details,
      confirmLabel: "확인",
      onClose: () => window.location.reload(),
    });
  }

  function openAttachmentPartialSuccess(details: string[], reloadOnClose = false) {
    completionModal.openModal({
      badgeLabel: "일부 완료",
      badgeTone: "warning",
      title: "일부 첨부만 처리되었습니다",
      description: "사유서는 저장했지만 일부 첨부 파일 처리에 실패했습니다.",
      details,
      confirmLabel: "확인",
      onClose: reloadOnClose ? () => window.location.reload() : undefined,
    });
  }

  async function requestFormData(url: string, formData: FormData, method = "POST") {
    const response = await fetch(url, {
      method,
      body: formData,
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "첨부 업로드에 실패했습니다.");
    return payload;
  }

  function handleAttachmentSelection(
    files: FileList | null,
    currentFiles: File[],
    setFiles: (files: File[]) => void,
  ) {
    const next = mergeAttachmentFiles(currentFiles, files);
    setFiles(next.files);

    if (next.errors.length > 0) {
      setMessage(null, next.errors.join(" "));
      return;
    }

    setMessage(null, null);
  }

  function handleCreateAttachmentSelection(files: FileList | null) {
    handleAttachmentSelection(files, createAttachments, setCreateAttachments);
  }

  function handleDrawerAttachmentSelection(files: FileList | null) {
    handleAttachmentSelection(files, drawerAttachments, setDrawerAttachments);
  }

  function removeCreateAttachment(index: number) {
    setCreateAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function removeDrawerAttachment(index: number) {
    setDrawerAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function uploadAttachments(noteId: number, files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const payload = await requestFormData(`/api/absence-notes/${noteId}/attachments`, formData);
    return {
      attachments: (payload.attachments ?? []) as AbsenceNoteAttachmentRecord[],
      failed: (payload.failed ?? []) as Array<{ fileName: string; message: string }>,
    };
  }

  function downloadAttachment(noteId: number, attachmentId: number) {
    window.open(
      `/api/absence-notes/${noteId}/attachments/${attachmentId}/download`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function uploadDrawerAttachments() {
    if (!selectedNote || drawerAttachments.length === 0) {
      return;
    }

    setMessage(null, null);
    startTransition(async () => {
      try {
        const uploadResult = await uploadAttachments(selectedNote.id, drawerAttachments);
        setSelectedNote((current) =>
          current
            ? {
                ...current,
                attachments: [...current.attachments, ...uploadResult.attachments],
              }
            : current,
        );

        if (uploadResult.failed.length > 0) {
          const failedNames = new Set(uploadResult.failed.map((item) => item.fileName));
          setDrawerAttachments((current) => current.filter((file) => failedNames.has(file.name)));
          openAttachmentPartialSuccess(
            uploadResult.failed.map((item) => `${item.fileName}: ${item.message}`),
          );
          return;
        }

        setDrawerAttachments([]);
        setNotice("첨부 파일을 업로드했습니다.");
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "첨부 업로드에 실패했습니다.");
      }
    });
  }

  function removeAttachment(attachment: AbsenceNoteAttachmentRecord) {
    if (!selectedNote) {
      return;
    }

    confirmModal.openModal({
      badgeLabel: "첨부 삭제",
      badgeTone: "warning",
      title: "첨부 파일을 삭제할까요?",
      description: `${attachment.originalFileName} 파일이 사유서에서 제거됩니다.`,
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);
        startTransition(async () => {
          try {
            const response = await fetch(
              `/api/absence-notes/${selectedNote.id}/attachments/${attachment.id}`,
              {
                method: "DELETE",
                cache: "no-store",
              },
            );
            const payload = await response.json();
            if (!response.ok) {
              throw new Error(payload.error ?? "첨부 삭제에 실패했습니다.");
            }
            setSelectedNote((current) =>
              current
                ? {
                    ...current,
                    attachments: current.attachments.filter((item) => item.id !== attachment.id),
                  }
                : current,
            );
            if (payload.storageCleanupError) {
              openAttachmentPartialSuccess([payload.storageCleanupError]);
              return;
            }
            setNotice("첨부 파일을 삭제했습니다.");
          } catch (error) {
            setMessage(null, error instanceof Error ? error.message : "첨부 삭제에 실패했습니다.");
          }
        });
      },
    });
  }

  // ── 단건 등록 ─────────────────────────────────────────────
  function createNote() {
    setMessage(null, null);
    startTransition(async () => {
      try {
        const createdNote = await requestJson("/api/absence-notes", {
          method: "POST",
          body: JSON.stringify({
            examNumber: createExamNumber,
            sessionId: Number(createSessionId),
            reason: createReason,
            absenceCategory: createCategory,
            attendCountsAsAttendance:
              createCategory === AbsenceCategory.MILITARY ? true : createCountsAsAttendance || createPerfectAttendance,
            attendGrantsPerfectAttendance: createCategory === AbsenceCategory.MILITARY ? true : createPerfectAttendance,
            adminNote: createAdminNote,
          }),
        });

        const completionDetails: string[] = [];
        if (createAttachments.length > 0) {
          try {
            const uploadResult = await uploadAttachments(createdNote.id, createAttachments);
            if (uploadResult.attachments.length > 0) {
              completionDetails.push(`첨부 ${uploadResult.attachments.length}건 업로드 완료`);
            }
            if (uploadResult.failed.length > 0) {
              setCreateAttachments([]);
              openAttachmentPartialSuccess(
                [
                  ...completionDetails,
                  ...uploadResult.failed.map((item) => `${item.fileName}: ${item.message}`),
                ],
                true,
              );
              return;
            }
          } catch (attachmentError) {
            setCreateAttachments([]);
            openAttachmentPartialSuccess(
              [attachmentError instanceof Error ? attachmentError.message : "첨부 업로드에 실패했습니다."],
              true,
            );
            return;
          }
        }

        setCreateAttachments([]);
        reloadPage(
          createCategory === AbsenceCategory.MILITARY
            ? "사유서를 등록하고 예비군 자동승인을 적용했습니다."
            : "사유서를 등록했습니다.",
          "등록 완료",
          completionDetails,
        );
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "사유서 등록에 실패했습니다.");
      }
    });
  }

  // ── 일괄 등록 ─────────────────────────────────────────────
  function bulkCreateNotes() {
    if (bulkSubMode === "weekday" && !isWeekdayBulkReady) {
      setMessage(null, "요일 반복 등록은 시작일, 종료일, 반복 요일을 모두 선택해야 합니다.");
      return;
    }
    if (effectiveSessionIds.length === 0) {
      setMessage(null, "등록할 회차를 선택하세요.");
      return;
    }
    setMessage(null, null);
    startTransition(async () => {
      try {
        const result = await requestJson("/api/absence-notes/bulk-create", {
          method: "POST",
          body: JSON.stringify({
            examNumber: createExamNumber,
            sessionIds: effectiveSessionIds,
            reason: createReason,
            absenceCategory: createCategory,
            attendCountsAsAttendance:
              createCategory === AbsenceCategory.MILITARY ? true : createCountsAsAttendance || createPerfectAttendance,
            attendGrantsPerfectAttendance: createCategory === AbsenceCategory.MILITARY ? true : createPerfectAttendance,
            adminNote: createAdminNote,
          }),
        });
        const parts = [`${result.succeeded}건 등록 완료`];
        if (result.skipped > 0) parts.push(`${result.skipped}건 이미 존재(건너뜀)`);
        if (result.errors.length > 0) parts.push(`${result.errors.length}건 실패`);
        reloadPage(parts.join(", "));
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "일괄 등록에 실패했습니다.");
      }
    });
  }

  // ── 드로어 회차 변경 ──────────────────────────────────────
  function changeNoteSession(noteId: number) {
    if (!changeSessionTargetId) {
      setMessage(null, "변경할 회차를 선택해 주세요.");
      return;
    }
    if (changeSessionTargetId === String(selectedNote?.sessionId)) {
      setMessage(null, "현재 회차와 같은 회차는 선택할 수 없습니다.");
      return;
    }
    const isApproved = selectedNote?.status === AbsenceStatus.APPROVED;

    const execute = () => {
      setMessage(null, null);
      startTransition(async () => {
        try {
          await requestJson(`/api/absence-notes/${noteId}`, {
            method: "PUT",
            body: JSON.stringify({ action: "changeSession", newSessionId: Number(changeSessionTargetId) }),
          });
          reloadPage(
            isApproved
              ? "회차를 변경했습니다. 승인 상태는 대기로 초기화됩니다."
              : "회차를 변경했습니다.",
            "회차 변경 완료",
            isApproved ? ["승인된 사유서는 회차 변경 시 다시 검토해야 합니다."] : [],
          );
        } catch (error) {
          setMessage(null, error instanceof Error ? error.message : "회차 변경에 실패했습니다.");
        }
      });
    };

    if (isApproved) {
      confirmModal.openModal({
        badgeLabel: "승인된 사유서",
        badgeTone: "warning",
        title: "회차를 변경할까요?",
        description: "승인된 사유서를 다른 회차로 옮기면 승인 상태가 취소되고 다시 검토 대기로 돌아갑니다.",
        cancelLabel: "취소",
        confirmLabel: "회차 변경",
        onConfirm: () => {
          confirmModal.closeModal();
          execute();
        },
      });
      return;
    }

    execute();
  }

  // ── 기존 함수들 ───────────────────────────────────────────
  function updateNote(noteId: number, formData: FormData) {
    setMessage(null, null);
    startTransition(async () => {
      try {
        const absenceCategory = formData.get("absenceCategory") as AbsenceCategory | null;
        const attendGrantsPerfectAttendance =
          absenceCategory === AbsenceCategory.MILITARY
            ? true
            : booleanFromFormData(formData, "attendGrantsPerfectAttendance");
        await requestJson(`/api/absence-notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({
            action: "update",
            reason: String(formData.get("reason") ?? ""),
            absenceCategory,
            attendCountsAsAttendance:
              absenceCategory === AbsenceCategory.MILITARY
                ? true
                : attendGrantsPerfectAttendance || booleanFromFormData(formData, "attendCountsAsAttendance"),
            attendGrantsPerfectAttendance,
            adminNote: String(formData.get("adminNote") ?? ""),
          }),
        });
        reloadPage("사유서를 수정했습니다.");
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "사유서 수정에 실패했습니다.");
      }
    });
  }

  function reviewNote(noteId: number, formData: FormData, action: "approve" | "reject") {
    setMessage(null, null);
    startTransition(async () => {
      try {
        const absenceCategory = formData.get("absenceCategory") as AbsenceCategory | null;
        const attendGrantsPerfectAttendance =
          absenceCategory === AbsenceCategory.MILITARY
            ? true
            : booleanFromFormData(formData, "attendGrantsPerfectAttendance");
        await requestJson(`/api/absence-notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({
            action,
            adminNote: String(formData.get("adminNote") ?? ""),
            attendCountsAsAttendance:
              absenceCategory === AbsenceCategory.MILITARY
                ? true
                : attendGrantsPerfectAttendance || booleanFromFormData(formData, "attendCountsAsAttendance"),
            attendGrantsPerfectAttendance,
          }),
        });
        reloadPage(action === "approve" ? "사유서를 승인했습니다." : "사유서를 반려했습니다.");
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "사유서 검토에 실패했습니다.");
      }
    });
  }

  function revertNote(noteId: number) {
    confirmModal.openModal({
      badgeLabel: "승인 취소",
      badgeTone: "warning",
      title: "승인을 취소할까요?",
      description: "승인을 취소하면 해당 회차의 출결 기록이 EXCUSED 상태에서 원래 값으로 되돌아갈 수 있습니다.",
      cancelLabel: "취소",
      confirmLabel: "승인 취소",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);
        startTransition(async () => {
          try {
            await requestJson(`/api/absence-notes/${noteId}`, {
              method: "PUT",
              body: JSON.stringify({ action: "revert" }),
            });
            reloadPage("승인을 취소했습니다.", "승인 취소 완료");
          } catch (error) {
            setMessage(null, error instanceof Error ? error.message : "승인 취소에 실패했습니다.");
          }
        });
      },
    });
  }

  function bulkReview(action: "approve" | "reject") {
    const label = action === "approve" ? "승인" : "반려";
    confirmModal.openModal({
      badgeLabel: `${label} 일괄`,
      badgeTone: "warning",
      title: `선택한 사유서를 ${label}할까요?`,
      description: `선택한 ${selectedNoteIds.length}건을 ${label} 처리합니다.`,
      cancelLabel: "취소",
      confirmLabel: label,
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);
        startTransition(async () => {
          try {
            const result = await requestJson("/api/absence-notes/bulk", {
              method: "POST",
              body: JSON.stringify({ action, ids: selectedNoteIds }),
            });
            reloadPage(
              `${result.succeeded}건 ${label} 완료${result.failed > 0 ? `, ${result.failed}건 실패` : ""}`,
              `일괄 ${label} 완료`,
            );
          } catch (error) {
            setMessage(null, error instanceof Error ? error.message : `${label} 처리에 실패했습니다.`);
          }
        });
      },
    });
  }

  function removeNote(noteId: number) {
    confirmModal.openModal({
      badgeLabel: "삭제",
      badgeTone: "warning",
      title: "사유서를 삭제할까요?",
      description: "삭제하면 첨부와 승인 결과까지 함께 정리되며 되돌릴 수 없습니다.",
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);
        startTransition(async () => {
          try {
            await requestJson(`/api/absence-notes/${noteId}`, { method: "DELETE" });
            reloadPage("사유서를 삭제했습니다.", "삭제 완료");
          } catch (error) {
            setMessage(null, error instanceof Error ? error.message : "사유서 삭제에 실패했습니다.");
          }
        });
      },
    });
  }

  function handleDrawerAction(action: "update" | "approve" | "reject") {
    if (!selectedNote || !drawerFormRef.current) return;
    const formData = new FormData(drawerFormRef.current);
    if (action === "update") updateNote(selectedNote.id, formData);
    else reviewNote(selectedNote.id, formData, action);
  }

  const allSelectableSelected =
    paginatedSelectableIds.length > 0 &&
    paginatedSelectableIds.every((id) => selectedNoteIds.includes(id));
  const pendingCount = notes.filter((n) => n.status === AbsenceStatus.PENDING).length;
  const rejectedCount = notes.filter((n) => n.status === AbsenceStatus.REJECTED).length;
  const selectedStudent = students.find((s) => s.examNumber === createExamNumber);
  const activePolicies = useMemo(
    () =>
      policies
        .filter((policy) => policy.isActive)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id),
    [policies],
  );

  function applyCreatePolicy(policyId: string) {
    setCreatePolicyId(policyId);

    const selectedPolicy = activePolicies.find((policy) => String(policy.id) === policyId);
    if (!selectedPolicy) {
      return;
    }

    const nextPerfectAttendance = selectedPolicy.attendGrantsPerfectAttendance;
    setCreateCategory(selectedPolicy.absenceCategory);
    setCreateCountsAsAttendance(selectedPolicy.attendCountsAsAttendance || nextPerfectAttendance);
    setCreatePerfectAttendance(nextPerfectAttendance);
  }

  // ── 공통 등록 폼 하단 (학생, 사유 유형, 출석/개근, 사유 내용, 관리자 메모) ──
  function renderCommonFormFields() {
    const isMilitary = createCategory === AbsenceCategory.MILITARY;
    const effectiveCreateCountsAsAttendance = isMilitary
      ? true
      : createCountsAsAttendance || createPerfectAttendance;
    const effectiveCreatePerfectAttendance = isMilitary ? true : createPerfectAttendance;

    return (
      <>
        {/* 사유 정책 + 사유 유형 */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">사유 정책</label>
            <select
              value={createPolicyId}
              onChange={(e) => applyCreatePolicy(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              <option value="">직접 선택</option>
              {activePolicies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name} · {ABSENCE_CATEGORY_LABEL[policy.absenceCategory]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate">
              자주 쓰는 사유 정책을 고르면 출석 포함과 개근 인정 값이 자동으로 채워집니다.
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">사유 유형</label>
            <select
              value={createCategory}
              onChange={(e) => {
                const nextCategory = e.target.value as AbsenceCategory;
                setCreatePolicyId("");
                setCreateCategory(nextCategory);
                if (nextCategory === AbsenceCategory.MILITARY) {
                  setCreateCountsAsAttendance(true);
                  setCreatePerfectAttendance(true);
                }
              }}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              {Object.values(AbsenceCategory).map((category) => (
                <option key={category} value={category}>{ABSENCE_CATEGORY_LABEL[category]}</option>
              ))}
            </select>
            {isMilitary && (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                예비군은 등록 즉시 자동승인되고 출석 포함과 개근 인정이 함께 적용됩니다.
              </p>
            )}
          </div>
        </div>

        {/* 출석 포함 + 개근 인정 */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${isMilitary ? "border-amber-200 bg-amber-50 text-amber-700" : "border-ink/10"}`}>
            <input
              type="checkbox"
              checked={effectiveCreateCountsAsAttendance}
              disabled={isMilitary || effectiveCreatePerfectAttendance}
              onChange={(e) => setCreateCountsAsAttendance(e.target.checked)}
              className="h-4 w-4"
            />
            출석 포함
            {isMilitary ? <span className="text-xs">(자동)</span> : null}
          </label>
          <label className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${isMilitary ? "border-amber-200 bg-amber-50 text-amber-700" : "border-ink/10"}`}>
            <input
              type="checkbox"
              checked={effectiveCreatePerfectAttendance}
              disabled={isMilitary}
              onChange={(e) => {
                const checked = e.target.checked;
                setCreatePerfectAttendance(checked);
                if (checked) {
                  setCreateCountsAsAttendance(true);
                }
              }}
              className="h-4 w-4"
            />
            개근 인정
            {isMilitary ? <span className="text-xs">(자동)</span> : null}
          </label>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">사유 내용</label>
          <textarea
            rows={3}
            value={createReason}
            onChange={(e) => setCreateReason(e.target.value)}
            className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
            placeholder="예: 병원 진료로 오전 시험 참석 불가"
          />
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">관리자 메모</label>
          <input
            value={createAdminNote}
            onChange={(e) => setCreateAdminNote(e.target.value)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            placeholder="내부 확인 메모"
          />
        </div>

        {createMode === "single" ? (
          <div className="mt-4">
            <AbsenceNoteAttachmentPanel
              title="첨부 파일"
              description="등록과 함께 사유서 증빙 파일을 첨부할 수 있습니다."
              emptyMessage="등록 후 첨부된 파일이 여기에 표시됩니다."
              selectedFiles={createAttachments}
              existingAttachments={[]}
              disabled={isPending}
              onFilesSelected={handleCreateAttachmentSelection}
              onRemoveSelected={removeCreateAttachment}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-ink/10 px-4 py-4 text-sm text-slate">
            첨부 파일은 단건 등록에서만 지원됩니다. 먼저 사유서를 등록한 뒤 검토 드로어에서 추가할 수도 있습니다.
          </div>
        )}
      </>    );
  }

  return (
    <div className="space-y-8">
      {notice ? (
        <div role="status" aria-live="polite" className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">{notice}</div>
      ) : null}
      {errorMessage ? (
        <div role="alert" aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {shouldShowCreateSection ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">사유서 등록</h2>
            <p className="mt-1 text-sm text-slate">해당 기간의 모든 회차(과거·미래 포함)에서 사유서를 등록할 수 있습니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {settingsHref ? (
              <a
                href={settingsHref}
                className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                사유 정책 설정
              </a>
            ) : null}
            <div className="flex rounded-full border border-ink/10 p-1 text-sm">
              <button
                type="button"
                onClick={() => setCreateMode("single")}
                className={`rounded-full px-4 py-1.5 font-semibold transition ${createMode === "single" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
              >
                단건 등록
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("bulk")}
                className={`rounded-full px-4 py-1.5 font-semibold transition ${createMode === "bulk" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
              >
                일괄 등록
              </button>
            </div>
          </div>
        </div>


        {/* 수강생 선택 (공통) */}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">수강생</label>
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="수험번호 또는 이름 검색"
              className="mb-2 w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
            <select
              value={createExamNumber}
              onChange={(e) => setCreateExamNumber(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              disabled={searchedStudents.length === 0}
            >
              {searchedStudents.length === 0 ? (
                <option value="">검색 결과 없음</option>
              ) : (
                searchedStudents.map((student) => (
                  <option key={student.examNumber} value={student.examNumber}>
                    {student.examNumber} · {student.name}
                    {student.currentStatus !== "NORMAL" ? ` [${STATUS_LABEL[student.currentStatus]}]` : ""}
                  </option>
                ))
              )}
            </select>
            {selectedStudent && selectedStudent.currentStatus !== "NORMAL" && (
              <p className="mt-1.5 text-xs">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[selectedStudent.currentStatus]}`}>
                  {STATUS_LABEL[selectedStudent.currentStatus]}
                </span>
                <span className="ml-1.5 text-slate">상태 학생입니다.</span>
              </p>
            )}
          </div>

          {/* 단건: 단일 회차 선택 */}
          {createMode === "single" && (
            <div className="xl:col-span-2">
              <label className="mb-2 block text-sm font-medium">회차 선택</label>
              <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate">날짜</label>
                  <input
                    type="date"
                    value={createDateFilter}
                    onChange={(e) => {
                      const date = e.target.value;
                      setCreateDateFilter(date);
                      const matched = sessions.filter((s) => getSessionDateKey(s) === date);
                      setCreateSessionId(matched[0] ? String(matched[0].id) : "");
                    }}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate">회차</label>
                  <select
                    value={createSessionId}
                    onChange={(e) => setCreateSessionId(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                  >
                    {filteredSessions.length === 0 ? (
                      <option value="">해당 날짜에 회차 없음</option>
                    ) : (
                      filteredSessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.week}주차 · {SUBJECT_LABEL[session.subject]}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}


          {/* 일괄: 날짜 범위 */}
          {createMode === "bulk" && (
            <div className="xl:col-span-3">
              {/* 서브모드 탭 */}
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setBulkSubMode("pick")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${bulkSubMode === "pick" ? "border-ember bg-ember/10 text-ember" : "border-ink/10 text-slate hover:border-ink/30"}`}
                >
                  날짜 직접 선택
                </button>
                <button
                  type="button"
                  onClick={() => setBulkSubMode("weekday")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${bulkSubMode === "weekday" ? "border-ember bg-ember/10 text-ember" : "border-ink/10 text-slate hover:border-ink/30"}`}
                >
                  요일 반복
                </button>
              </div>

              {/* 날짜 범위 */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate">시작일</label>
                  <input
                    type="date"
                    value={bulkDateFrom}
                    onChange={(e) => setBulkDateFrom(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate">종료일</label>
                  <input
                    type="date"
                    value={bulkDateTo}
                    onChange={(e) => setBulkDateTo(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              {/* 요일 선택 (weekday 모드) */}
              {bulkSubMode === "weekday" && (
                <div className="mt-3">
                  <label className="mb-2 block text-xs font-medium text-slate">반복 요일 선택</label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <label
                        key={i}
                        className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition ${bulkWeekdays.includes(i) ? "border-ink bg-ink text-white" : "border-ink/10 text-slate hover:border-ink/30"}`}
                      >
                        <input
                          type="checkbox"
                          checked={bulkWeekdays.includes(i)}
                          onChange={(e) =>
                            setBulkWeekdays((prev) =>
                              e.target.checked ? [...prev, i] : prev.filter((d) => d !== i),
                            )
                          }
                          className="sr-only"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* pick 모드: 체크박스 목록 */}
              {bulkSubMode === "pick" && bulkFilteredSessions.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium text-slate">회차 선택</label>
                    <button
                      type="button"
                      onClick={() =>
                        setBulkSelectedIds(
                          bulkSelectedIds.length === bulkFilteredSessions.length
                            ? []
                            : bulkFilteredSessions.map((s) => s.id),
                        )
                      }
                      className="text-xs text-ember underline"
                    >
                      {bulkSelectedIds.length === bulkFilteredSessions.length ? "전체 해제" : "전체 선택"}
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-2xl border border-ink/10 divide-y divide-ink/5">
                    {bulkFilteredSessions.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-mist/40">
                        <input
                          type="checkbox"
                          checked={bulkSelectedIds.includes(s.id)}
                          onChange={(e) =>
                            setBulkSelectedIds((prev) =>
                              e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                            )
                          }
                          className="h-4 w-4"
                        />
                        <span>{formatDate(s.examDate)} · {s.week}주차 · {SUBJECT_LABEL[s.subject]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* weekday 모드: 미리보기 */}
              {bulkSubMode === "weekday" ? (
                <div className="mt-3 rounded-2xl border border-ink/10 p-3">
                  {!isWeekdayBulkReady ? (
                    <p className="text-xs text-amber-700">시작일, 종료일, 반복 요일을 모두 선택해야 회차가 계산됩니다.</p>
                  ) : effectiveSessionIds.length > 0 ? (
                    <>
                      <p className="mb-2 text-xs font-medium text-slate">해당 회차 ({effectiveSessionIds.length}건)</p>
                      <ul className="max-h-32 overflow-y-auto space-y-1 text-xs text-slate">
                        {bulkFilteredSessions.map((s) => (
                          <li key={s.id}>{formatDate(s.examDate)} · {s.week}주차 · {SUBJECT_LABEL[s.subject]}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-slate">선택한 조건에 맞는 회차가 없습니다.</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* 공통 필드 */}
        {renderCommonFormFields()}

        {/* 등록 버튼 */}
        {createMode === "single" ? (
          <button
            type="button"
            onClick={createNote}
            disabled={isPending || !createExamNumber || !createReason.trim() || !hasSelectedCreateSession}
            className="mt-4 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {createCategory === AbsenceCategory.MILITARY ? "사유서 등록 (즉시 승인)" : "사유서 등록"}
          </button>
        ) : (
          <button
            type="button"
            onClick={bulkCreateNotes}
            disabled={isPending || !createExamNumber || !createReason.trim() || effectiveSessionIds.length === 0 || (bulkSubMode === "weekday" && !isWeekdayBulkReady)}
            className="mt-4 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {bulkSubMode === "weekday" && !isWeekdayBulkReady
              ? "일괄 등록 (기간·요일 선택 필요)"
              : effectiveSessionIds.length > 0
                ? `${effectiveSessionIds.length}개 회차 일괄 등록`
                : "일괄 등록 (회차 선택 필요)"}
          </button>
        )}
      </section>
      ) : null}

      {shouldShowReviewSection ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">사유서 검토</h2>
            {pendingCount > 0 && (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                대기 {pendingCount}건
              </span>
            )}
            {rejectedCount > 0 && (
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                반려 {rejectedCount}건
              </span>
            )}
          </div>
        </div>

        {notes.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            조회된 사유서가 없습니다. 위 필터에서 조건을 변경하거나 사유서를 등록하세요.
          </div>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10">
              <table className="w-full text-sm">
                <caption className="sr-only">Absence note review table with bulk selection and status columns.</caption>
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60 text-left text-xs font-semibold text-slate">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        aria-label="Select all pending or rejected absence notes on this page"
                        checked={allSelectableSelected}
                        disabled={paginatedSelectableIds.length === 0}
                        onChange={(e) => setSelectedNoteIds(e.target.checked ? paginatedSelectableIds : [])}
                        title="대기·반려 항목 전체 선택"
                      />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("examNumber")}>
                      수험번호 · 이름 <SortIcon column="examNumber" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("status")}>
                      상태 <SortIcon column="status" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="px-4 py-3">학생 상태</th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("absenceCategory")}>
                      사유 유형 <SortIcon column="absenceCategory" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("attendCountsAsAttendance")}>
                      출석포함 <SortIcon column="attendCountsAsAttendance" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("attendGrantsPerfectAttendance")}>
                      개근인정 <SortIcon column="attendGrantsPerfectAttendance" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("examDate")}>
                      회차 정보 <SortIcon column="examDate" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("submittedAt")}>
                      제출일 <SortIcon column="submittedAt" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="px-4 py-3">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {paginatedNotes.map((note) => {
                    const isSelectable = note.status !== AbsenceStatus.APPROVED;
                    return (
                      <tr
                        key={note.id}
                        onClick={() => {
                          setSelectedNote(note);
                          setChangeSessionDateFilter(todayKey);
                          const todaySessionId = findFirstSessionIdByDate(sessions, todayKey);
                          setChangeSessionTargetId(todaySessionId ? String(todaySessionId) : "");
                        }}
                        className="cursor-pointer transition-colors hover:bg-mist/40"
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {isSelectable ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer"
                              aria-label={`${note.examNumber} absence note`}
                              checked={selectedNoteIds.includes(note.id)}
                              onChange={(e) =>
                                setSelectedNoteIds((current) =>
                                  e.target.checked ? [...current, note.id] : current.filter((id) => id !== note.id),
                                )
                              }
                            />
                          ) : (
                            <div className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium">{note.examNumber} · {note.student.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${NOTE_STATUS_CLASS[note.status]}`}>
                            {NOTE_STATUS_LABEL[note.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[note.student.currentStatus]}`}>
                            {STATUS_LABEL[note.student.currentStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate">
                          {note.absenceCategory ? ABSENCE_CATEGORY_LABEL[note.absenceCategory] : "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {note.attendCountsAsAttendance ? (
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">포함</span>
                          ) : (
                            <span className="text-slate">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {note.attendGrantsPerfectAttendance ? (
                            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">인정</span>
                          ) : (
                            <span className="text-slate">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate">
                          {note.session.period.name} · {formatDate(note.session.examDate)} · {note.session.week}주차 · {SUBJECT_LABEL[note.session.subject]}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate">
                          {note.submittedAt ? formatDateTime(note.submittedAt) : "-"}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`/admin/absence-notes/${note.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
                          >
                            상세
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate">
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedNotes.length)} / {sortedNotes.length}건
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30">«</button>
                  <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30">‹</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                    const page = start + i;
                    return (
                      <button key={page} type="button" onClick={() => setCurrentPage(page)}
                        className={`min-w-[2rem] rounded-lg px-2 py-1 transition ${page === currentPage ? "bg-ink font-semibold text-white" : "text-slate hover:bg-mist"}`}>
                        {page}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30">›</button>
                  <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30">»</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
      ) : null}

      {selectedNoteIds.length > 0 ? <div className="h-24" /> : null}
      {selectedNoteIds.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink/10 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:left-[260px] sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink">{selectedNoteIds.length}건 선택됨</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => bulkReview("approve")}
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                선택 승인
              </button>
              <button
                type="button"
                onClick={() => bulkReview("reject")}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                선택 반려
              </button>
              <button
                type="button"
                onClick={() => setSelectedNoteIds([])}
                className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
              >
                선택 해제
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shouldShowGuidanceSection ? (        <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">운영 안내</h2>
              <ul className="mt-4 space-y-2 text-sm leading-7 text-slate">
                <li>과거·미래 모든 회차에 사유서를 등록할 수 있습니다.</li>
                <li><span className="font-semibold text-ink">예비군</span>은 사유서 등록 시 자동으로 즉시 승인되며 출석 포함과 개근 인정이 함께 적용됩니다.</li>
                <li>사유 정책을 선택하면 출석 포함과 개근 인정 기본값이 자동으로 채워지며, 필요하면 등록 화면에서 바로 조정할 수 있습니다.</li>
                <li>승인되면 ABSENT는 EXCUSED로 변경되고 상태 판정이 다시 계산되며, 출석률 반영 여부는 사유서 설정값을 따릅니다.</li>
                <li>반려된 사유서는 재검토하여 다시 승인할 수 있습니다.</li>
              </ul>
            </div>
            {settingsHref ? (
              <a
                href={settingsHref}
                className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                사유 정책 설정으로 이동
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 사이드 드로어 */}
      {shouldShowReviewSection && selectedNote ? (
        <>
          <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px]" onClick={() => setSelectedNote(null)} />
          <div key={selectedNote.id} className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl">
            {/* 헤더 */}
            <div className="shrink-0 flex items-start justify-between border-b border-ink/10 px-6 py-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{selectedNote.examNumber} · {selectedNote.student.name}</h3>
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${NOTE_STATUS_CLASS[selectedNote.status]}`}>
                    {NOTE_STATUS_LABEL[selectedNote.status]}
                  </span>
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[selectedNote.student.currentStatus]}`}>
                    {STATUS_LABEL[selectedNote.student.currentStatus]}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate">
                  {selectedNote.session.period.name} · {formatDate(selectedNote.session.examDate)} · {selectedNote.session.week}주차 · {SUBJECT_LABEL[selectedNote.session.subject]}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-slate/70">
                  <span>제출: {selectedNote.submittedAt ? formatDateTime(selectedNote.submittedAt) : "-"}</span>
                  <span>승인: {selectedNote.approvedAt ? formatDateTime(selectedNote.approvedAt) : "-"}</span>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedNote(null)} className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate transition hover:bg-ink/10 hover:text-ink" aria-label="닫기">✕</button>
            </div>

            {/* 폼 스크롤 영역 */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-6 py-5">
                {selectedNote.status === AbsenceStatus.APPROVED && (
                  <div className="mb-5 flex items-center gap-2 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
                    <span className="font-semibold">승인 완료</span>
                    <span className="text-forest/70">— 내용 수정이 불가합니다. 변경이 필요하면 삭제 후 재등록하세요.</span>
                  </div>
                )}
                {selectedNote.status === AbsenceStatus.REJECTED && (
                  <div className="mb-5 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <span className="font-semibold">반려됨</span>
                    <span className="text-red-500">— 내용 수정 후 다시 승인하거나 삭제할 수 있습니다.</span>
                  </div>
                )}

                <form ref={drawerFormRef} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium">사유 내용</label>
                    <textarea
                      name="reason"
                      rows={5}
                      defaultValue={selectedNote.reason}
                      disabled={selectedNote.status === AbsenceStatus.APPROVED}
                      className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium">사유 유형</label>
                      <select
                        name="absenceCategory"
                        defaultValue={selectedNote.absenceCategory ?? AbsenceCategory.OTHER}
                        disabled={selectedNote.status === AbsenceStatus.APPROVED}
                        className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate"
                      >
                        {Object.values(AbsenceCategory).map((category) => (
                          <option key={category} value={category}>{ABSENCE_CATEGORY_LABEL[category]}</option>
                        ))}
                      </select>
                      {selectedNote.absenceCategory === AbsenceCategory.MILITARY && selectedNote.status !== AbsenceStatus.APPROVED && (
                        <p className="mt-1.5 text-xs text-amber-600">예비군: 승인 시 자동으로 출석 포함 + 개근 인정</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">관리자 메모</label>
                      <input
                        name="adminNote"
                        defaultValue={selectedNote.adminNote ?? ""}
                        className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                        placeholder="내부 확인 메모"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate">
                      <input
                        type="checkbox"
                        name="attendCountsAsAttendance"
                        defaultChecked={selectedNote.absenceCategory === AbsenceCategory.MILITARY ? true : selectedNote.attendCountsAsAttendance}
                        disabled={selectedNote.absenceCategory === AbsenceCategory.MILITARY}
                        className="h-4 w-4"
                      />
                      출석 포함
                      {selectedNote.absenceCategory === AbsenceCategory.MILITARY && (
                        <span className="text-xs text-amber-600">(예비군 자동)</span>
                      )}
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate">
                      <input
                        type="checkbox"
                        name="attendGrantsPerfectAttendance"
                        defaultChecked={selectedNote.absenceCategory === AbsenceCategory.MILITARY ? true : selectedNote.attendGrantsPerfectAttendance}
                        disabled={selectedNote.absenceCategory === AbsenceCategory.MILITARY}
                        className="h-4 w-4"
                      />
                      개근 인정
                      {selectedNote.absenceCategory === AbsenceCategory.MILITARY && (
                        <span className="text-xs text-amber-600">(예비군 자동)</span>
                      )}
                    </label>
                  </div>
                </form>

                <div className="mt-6 space-y-3">
                  <AbsenceNoteAttachmentPanel
                    title="첨부 파일"
                    description="파일을 추가로 올리거나 기존 첨부를 내려받을 수 있습니다."
                    emptyMessage="등록된 첨부가 없습니다."
                    selectedFiles={drawerAttachments}
                    existingAttachments={selectedNote.attachments}
                    disabled={isPending || selectedNote.status === AbsenceStatus.APPROVED}
                    canDeleteExisting={selectedNote.status !== AbsenceStatus.APPROVED}
                    onFilesSelected={handleDrawerAttachmentSelection}
                    onRemoveSelected={removeDrawerAttachment}
                    onDeleteExisting={removeAttachment}
                    onDownloadExisting={(attachment) => downloadAttachment(selectedNote.id, attachment.id)}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={uploadDrawerAttachments}
                      disabled={isPending || selectedNote.status === AbsenceStatus.APPROVED || drawerAttachments.length === 0}
                      className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      첨부 업로드
                    </button>
                  </div>
                </div>
                {/* 회차 변경 섹션 */}
                <div className="mt-6 rounded-2xl border border-ink/10 p-4">
                  <h4 className="text-sm font-semibold">회차 변경</h4>
                  <p className="mt-1 text-xs text-slate">
                    잘못 등록된 날짜를 수정합니다.
                    {selectedNote.status === AbsenceStatus.APPROVED && (
                      <span className="ml-1 font-medium text-amber-600">변경 시 승인이 취소됩니다.</span>
                    )}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate">날짜 필터</label>
                      <input
                        type="date"
                        value={changeSessionDateFilter}
                        onChange={(e) => {
                          setChangeSessionDateFilter(e.target.value);
                          const matched = sessions.filter((s) => getSessionDateKey(s) === e.target.value);
                          setChangeSessionTargetId(matched[0] ? String(matched[0].id) : "");
                        }}
                        className="w-full rounded-2xl border border-ink/10 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate">변경할 회차</label>
                      <select
                        value={changeSessionTargetId}
                        onChange={(e) => setChangeSessionTargetId(e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 px-3 py-2 text-sm"
                      >
                        {changeSessionOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {formatDate(s.examDate)} · {s.week}주차 · {SUBJECT_LABEL[s.subject]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => changeNoteSession(selectedNote.id)}
                    disabled={
                      isPending ||
                      !changeSessionTargetId ||
                      changeSessionTargetId === String(selectedNote.sessionId)
                    }
                    className="mt-3 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    회차 변경
                  </button>
                </div>
              </div>

              {/* 푸터 액션 */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-6 py-4">
                <button
                  type="button"
                  onClick={() => removeNote(selectedNote.id)}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  삭제
                </button>
                <div className="flex flex-wrap gap-2">
                  {selectedNote.status !== AbsenceStatus.APPROVED && (
                    <button
                      type="button"
                      onClick={() => handleDrawerAction("update")}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      저장
                    </button>
                  )}
                  {selectedNote.status !== AbsenceStatus.APPROVED && (
                    <button
                      type="button"
                      onClick={() => handleDrawerAction("approve")}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
                    >
                      승인
                    </button>
                  )}
                  {selectedNote.status === AbsenceStatus.PENDING && (
                    <button
                      type="button"
                      onClick={() => handleDrawerAction("reject")}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      반려
                    </button>
                  )}
                  {selectedNote.status === AbsenceStatus.APPROVED && (
                    <button
                      type="button"
                      onClick={() => revertNote(selectedNote.id)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      승인취소
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
      <ActionModal
        open={Boolean(completionModal.modal)}
        badgeLabel={completionModal.modal?.badgeLabel ?? ""}
        badgeTone={completionModal.modal?.badgeTone}
        title={completionModal.modal?.title ?? ""}
        description={completionModal.modal?.description ?? ""}
        details={completionModal.modal?.details ?? []}
        confirmLabel={completionModal.modal?.confirmLabel ?? "확인"}
        onClose={completionModal.closeModal}
        onConfirm={completionModal.modal?.onConfirm}
      />
    </div>
  );
}
