'use client';

import { exportGroupsToExcel } from '@/lib/study-group/excel';
import { StudyGroup } from '@/lib/study-group/types';

interface GroupExportProps {
  groups: StudyGroup[];
  examLabel: string;
}

export default function GroupExport({ groups, examLabel }: GroupExportProps) {
  const handleExport = async () => {
    try {
      const blob = await exportGroupsToExcel(groups, examLabel);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${examLabel}_면접스터디_편성결과.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('엑셀 파일을 내보내는 중 오류가 발생했습니다.');
      console.error(error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={groups.length === 0}
      className="rounded bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
    >
      엑셀 내보내기
    </button>
  );
}
