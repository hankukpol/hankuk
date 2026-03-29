'use client';

import { Member } from '@/lib/study-group/types';

interface MemberTableProps {
  members: Member[];
  onUpdateMember?: (id: string, updates: Partial<Member>) => void;
  totalGroups?: number;
}

export default function MemberTable({
  members,
  onUpdateMember,
  totalGroups,
}: MemberTableProps) {
  const maleCount = members.filter((member) => member.gender === 'male').length;
  const femaleCount = members.length - maleCount;
  const hasScores = members.some((member) => member.score !== undefined);
  const hasAges = members.some((member) => member.age !== undefined);
  const hasPreAssigned = members.some(
    (member) => member.preAssignedGroup !== undefined
  );
  const preAssignedCount = members.filter(
    (member) => member.preAssignedGroup !== undefined
  ).length;

  const seriesCounts = members.reduce<Record<string, number>>((acc, member) => {
    const key = member.series || '미분류';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const maxGroup =
    totalGroups ||
    Math.max(
      10,
      ...members
        .filter((member) => member.preAssignedGroup)
        .map((member) => member.preAssignedGroup!)
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-gray-700">
          업로드한 명단 ({members.length}명)
        </h3>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span>남 {maleCount}명</span>
          <span>여 {femaleCount}명</span>
          {hasPreAssigned && (
            <span className="text-blue-600">사전 편성 {preAssignedCount}명</span>
          )}
          {hasAges && (
            <span>
              나이 입력 {members.filter((member) => member.age !== undefined).length}명
            </span>
          )}
          {hasScores && (
            <span>
              성적 입력 {members.filter((member) => member.score !== undefined).length}명
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(seriesCounts).map(([series, count]) => (
          <span
            key={series}
            className="inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs text-gray-700"
          >
            {series}: {count}명
          </span>
        ))}
      </div>

      <div className="max-h-[400px] overflow-y-auto overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">이름</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">연락처</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">성별</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">직렬</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">지역</th>
              {hasAges && (
                <th className="px-3 py-2 text-left font-medium text-gray-600">나이</th>
              )}
              {hasScores && (
                <th className="px-3 py-2 text-left font-medium text-gray-600">성적</th>
              )}
              <th className="px-3 py-2 text-left font-medium text-gray-600">편성 조</th>
            </tr>
          </thead>

          <tbody>
            {members.map((member, index) => (
              <tr
                key={member.id}
                className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                  member.preAssignedGroup ? 'bg-blue-50/50' : ''
                }`}
              >
                <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                <td className="px-3 py-2">{member.name}</td>
                <td className="px-3 py-2 text-gray-600">{member.phone}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-xs ${
                      member.gender === 'male'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-pink-100 text-pink-700'
                    }`}
                  >
                    {member.gender === 'male' ? '남' : '여'}
                  </span>
                </td>
                <td className="px-3 py-2">{member.series || '-'}</td>
                <td className="px-3 py-2">{member.region || '-'}</td>
                {hasAges && (
                  <td className="px-3 py-2 text-gray-600">
                    {member.age !== undefined ? `${member.age}세` : '-'}
                  </td>
                )}
                {hasScores && (
                  <td className="px-3 py-2 text-gray-600">
                    {member.score !== undefined ? member.score : '-'}
                  </td>
                )}
                <td className="px-3 py-2">
                  {onUpdateMember ? (
                    <select
                      value={member.preAssignedGroup ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        onUpdateMember(member.id, {
                          preAssignedGroup: value ? parseInt(value, 10) : undefined,
                        });
                      }}
                      className="rounded border px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">자동</option>
                      {Array.from({ length: maxGroup }, (_, groupIndex) => (
                        <option key={groupIndex + 1} value={groupIndex + 1}>
                          {groupIndex + 1}조
                        </option>
                      ))}
                    </select>
                  ) : member.preAssignedGroup ? (
                    <span className="inline-flex rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                      {member.preAssignedGroup}조
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">자동</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
