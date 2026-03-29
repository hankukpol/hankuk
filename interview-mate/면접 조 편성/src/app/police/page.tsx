'use client';

import Link from 'next/link';
import StudyGroupManager from '@/components/study-group/StudyGroupManager';
import { POLICE_CONFIG } from '@/lib/study-group/config';

export default function PolicePage() {
  return (
    <div className="p-6">
      <div className="mb-4">
        <Link
          href="/"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          시험 유형 선택으로 돌아가기
        </Link>
      </div>
      <StudyGroupManager config={POLICE_CONFIG} />
    </div>
  );
}
