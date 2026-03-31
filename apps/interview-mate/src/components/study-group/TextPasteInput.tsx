'use client';

import { useCallback, useState } from 'react';
import { parseTextInput } from '@/lib/study-group/excel';
import { Member, StudyGroup } from '@/lib/study-group/types';

interface TextPasteInputProps {
  onApply: (members: Member[], restoredGroups?: StudyGroup[]) => void;
}

export default function TextPasteInput({ onApply }: TextPasteInputProps) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Member[] | null>(null);
  const [restoredGroups, setRestoredGroups] = useState<StudyGroup[] | undefined>();
  const [error, setError] = useState<string | null>(null);

  const handlePreview = useCallback(() => {
    if (!text.trim()) {
      setError('붙여넣을 텍스트를 입력하세요.');
      setPreview(null);
      setRestoredGroups(undefined);
      return;
    }

    try {
      const result = parseTextInput(text);
      if (result.members.length === 0) {
        setError(
          '읽을 수 있는 데이터가 없습니다. 첫 줄에는 헤더를, 다음 줄부터는 데이터를 넣어주세요.'
        );
        setPreview(null);
        setRestoredGroups(undefined);
        return;
      }

      setPreview(result.members);
      setRestoredGroups(result.restoredGroups);
      setError(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : '텍스트를 읽는 중 오류가 발생했습니다.'
      );
      setPreview(null);
      setRestoredGroups(undefined);
    }
  }, [text]);

  const handleApply = useCallback(() => {
    if (!preview || preview.length === 0) {
      return;
    }

    onApply(preview, restoredGroups);
    setText('');
    setPreview(null);
    setRestoredGroups(undefined);
  }, [onApply, preview, restoredGroups]);

  const previewHasAges = preview?.some((member) => member.age !== undefined) ?? false;
  const previewHasScores =
    preview?.some((member) => member.score !== undefined) ?? false;
  const previewHasInterviewExperience =
    preview?.some((member) => member.interviewExperience !== undefined) ?? false;
  const previewHasGroups =
    preview?.some((member) => member.preAssignedGroup !== undefined) ?? false;

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setPreview(null);
          setRestoredGroups(undefined);
          setError(null);
        }}
        placeholder={`엑셀에서 복사한 데이터를 붙여넣으세요.

예시 (탭 구분):
이름\t연락처\t성별\t직렬\t지역\t면접 경험 여부\t나이\t필기성적\t조
홍길동\t010-1234-5678\t남\t일반\t서울\t있음\t28\t85.5\t
김영희\t010-9876-5432\t여\t101경비단\t경기\t없음\t1998\t\t1`}
        className="h-40 w-full resize-y rounded-lg border p-3 font-mono text-sm focus:border-blue-400 focus:outline-none"
      />

      <div className="flex gap-2">
        <button
          onClick={handlePreview}
          disabled={!text.trim()}
          className="rounded bg-gray-100 px-4 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
        >
          미리보기
        </button>

        {preview && preview.length > 0 && (
          <button
            onClick={handleApply}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-700"
          >
            적용 ({preview.length}명
            {restoredGroups ? ' / 복원 모드' : ''})
          </button>
        )}
      </div>

      {error && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}

      {preview && preview.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
            미리보기 ({preview.length}명)
            {restoredGroups && (
              <span className="ml-2 text-green-600">
                복원된 조 {restoredGroups.length}개
              </span>
            )}
          </div>

          <div className="max-h-60 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                    #
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                    이름
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                    연락처
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                    성별
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                    직렬
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                    지역
                  </th>
                  {previewHasInterviewExperience && (
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                      면접 경험
                    </th>
                  )}
                  {previewHasAges && (
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                      나이
                    </th>
                  )}
                  {previewHasScores && (
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                      성적
                    </th>
                  )}
                  {previewHasGroups && (
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                      조
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.map((member, index) => (
                  <tr
                    key={member.id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <td className="px-3 py-1.5 text-gray-400">{index + 1}</td>
                    <td className="px-3 py-1.5">{member.name}</td>
                    <td className="px-3 py-1.5 text-gray-600">{member.phone || '-'}</td>
                    <td className="px-3 py-1.5">
                      {member.gender === 'male' ? '남' : '여'}
                    </td>
                    <td className="px-3 py-1.5">{member.series || '-'}</td>
                    <td className="px-3 py-1.5">{member.region || '-'}</td>
                    {previewHasInterviewExperience && (
                      <td className="px-3 py-1.5">
                        {member.interviewExperience === true
                          ? '있음'
                          : member.interviewExperience === false
                            ? '없음'
                            : '-'}
                      </td>
                    )}
                    {previewHasAges && (
                      <td className="px-3 py-1.5">
                        {member.age !== undefined ? `${member.age}세` : '-'}
                      </td>
                    )}
                    {previewHasScores && (
                      <td className="px-3 py-1.5">{member.score ?? '-'}</td>
                    )}
                    {previewHasGroups && (
                      <td className="px-3 py-1.5">
                        {member.preAssignedGroup ? `${member.preAssignedGroup}조` : '-'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
