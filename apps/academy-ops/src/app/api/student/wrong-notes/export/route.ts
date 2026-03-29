import { NextRequest, NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { listStudentWrongNotes } from "@/lib/student-portal/service";
import { SUBJECT_LABEL } from "@/lib/constants";

/**
 * GET /api/student/wrong-notes/export
 *
 * Returns all wrong notes for the authenticated student, grouped by subject,
 * sorted by subject total count (most wrong subject first) and within each
 * subject by repeat count (most repeated question first).
 *
 * Used for potential future PDF generation / offline export.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const notes = await listStudentWrongNotes({
      examNumber: auth.student.examNumber,
    });

    if (notes.length === 0) {
      return NextResponse.json({
        data: {
          examNumber: auth.student.examNumber,
          name: auth.student.name,
          exportedAt: new Date().toISOString(),
          totalCount: 0,
          subjectCount: 0,
          groups: [],
        },
      });
    }

    // Count how many times each questionId appears (repeat wrong count)
    const repeatMap: Record<number, number> = {};
    for (const note of notes) {
      repeatMap[note.questionId] = (repeatMap[note.questionId] ?? 0) + 1;
    }

    // Group by subject
    const subjectGroups: Record<
      string,
      {
        subject: string;
        label: string;
        count: number;
        notes: {
          id: number;
          questionNo: number;
          questionId: number;
          examDate: string;
          correctAnswer: string;
          studentAnswer: string | null;
          correctRate: number | null;
          difficulty: string | null;
          repeatCount: number;
          memo: string | null;
          createdAt: string;
          updatedAt: string;
        }[];
      }
    > = {};

    for (const note of notes) {
      const key = note.subject;
      if (!subjectGroups[key]) {
        subjectGroups[key] = {
          subject: key,
          label: SUBJECT_LABEL[note.subject] ?? key,
          count: 0,
          notes: [],
        };
      }
      subjectGroups[key].count += 1;
      subjectGroups[key].notes.push({
        id: note.id,
        questionNo: note.questionNo,
        questionId: note.questionId,
        examDate: note.examDate.toISOString().split("T")[0],
        correctAnswer: note.correctAnswer,
        studentAnswer: note.studentAnswer,
        correctRate: note.correctRate,
        difficulty: note.difficulty,
        repeatCount: repeatMap[note.questionId] ?? 1,
        memo: note.memo,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      });
    }

    // Sort within each group: highest repeatCount first, then by questionNo
    for (const group of Object.values(subjectGroups)) {
      group.notes.sort((a, b) => {
        if (b.repeatCount !== a.repeatCount) return b.repeatCount - a.repeatCount;
        return a.questionNo - b.questionNo;
      });
    }

    // Sort groups by count descending
    const groups = Object.values(subjectGroups).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      data: {
        examNumber: auth.student.examNumber,
        name: auth.student.name,
        exportedAt: new Date().toISOString(),
        totalCount: notes.length,
        subjectCount: groups.length,
        groups,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "오답 노트를 내보내지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
