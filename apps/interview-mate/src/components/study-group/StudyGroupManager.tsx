'use client';

import { useCallback, useState } from 'react';
import {
  AssignmentResult,
  ExamConfig,
  GroupSettings as GroupSettingsType,
  Member,
  StudyGroup,
} from '@/lib/study-group/types';
import { assignGroups } from '@/lib/study-group/algorithm';
import ExcelUploader from './ExcelUploader';
import ForceAssignRules from './ForceAssignRules';
import GroupExport from './GroupExport';
import GroupResult from './GroupResult';
import GroupSettings from './GroupSettings';
import MemberTable from './MemberTable';

interface StudyGroupManagerProps {
  config: ExamConfig;
}

function cloneSettings(settings: GroupSettingsType): GroupSettingsType {
  return {
    ...settings,
    groupSize: { ...settings.groupSize },
    genderRatio: { ...settings.genderRatio },
    forceAssignRules: settings.forceAssignRules.map((rule) => ({ ...rule })),
    penaltyWeights: { ...settings.penaltyWeights },
    pairRequiredSeries: [...(settings.pairRequiredSeries ?? [])],
  };
}

export default function StudyGroupManager({ config }: StudyGroupManagerProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<GroupSettingsType>(() =>
    cloneSettings(config.defaultSettings)
  );
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [isRestored, setIsRestored] = useState(false);

  const hasScores = members.some((member) => member.score !== undefined);
  const hasAges = members.some((member) => member.age !== undefined);
  const hasInterviewExperience = members.some(
    (member) => member.interviewExperience !== undefined
  );
  const hasPreAssigned = members.some(
    (member) => member.preAssignedGroup !== undefined
  );
  const seriesList = Array.from(
    new Set([
      ...config.seriesList,
      ...members.map((member) => member.series).filter(Boolean),
    ])
  );

  const invalidateResult = useCallback(() => {
    setResult(null);
    setIsRestored(false);
  }, []);

  const handleSettingsChange = useCallback(
    (nextSettings: GroupSettingsType) => {
      setSettings(nextSettings);
      invalidateResult();
    },
    [invalidateResult]
  );

  const handleForceAssignRulesChange = useCallback(
    (rules: GroupSettingsType['forceAssignRules']) => {
      setSettings((prev) => ({
        ...prev,
        forceAssignRules: rules,
      }));
      invalidateResult();
    },
    [invalidateResult]
  );

  const handleUpload = useCallback(
    (uploadedMembers: Member[], restoredGroups?: StudyGroup[]) => {
      setMembers(uploadedMembers);

      if (restoredGroups && restoredGroups.length > 0) {
        setSettings((prev) => ({
          ...prev,
          usePreAssignment: false,
        }));
        setResult({
          groups: restoredGroups,
          warnings: [],
          lockedMemberIds: [],
        });
        setIsRestored(true);
        return;
      }

      setResult(null);
      setIsRestored(false);
    },
    []
  );

  const handleUpdateMember = useCallback((id: string, updates: Partial<Member>) => {
    setMembers((prev) =>
      prev.map((member) => (member.id === id ? { ...member, ...updates } : member))
    );
    invalidateResult();
  }, [invalidateResult]);

  const handleAssign = useCallback(() => {
    if (members.length === 0) {
      return;
    }

    setResult(assignGroups(members, settings));
    setIsRestored(false);
  }, [members, settings]);

  const handleReset = useCallback(() => {
    setMembers([]);
    setResult(null);
    setIsRestored(false);
    setSettings(cloneSettings(config.defaultSettings));
  }, [config.defaultSettings]);

  const estimatedGroups =
    members.length > 0
      ? Math.max(1, Math.ceil(members.length / Math.max(settings.groupSize.max, 1)))
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {config.label} 면접 스터디 조 편성
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            명단을 업로드한 뒤 기준을 선택하면 페널티 기반 최적화로 스터디 조를
            자동 편성합니다.
          </p>
        </div>
        {members.length > 0 && (
          <button
            onClick={handleReset}
            className="rounded border px-3 py-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
          >
            초기화
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-white p-5">
        <ExcelUploader onUpload={handleUpload} />
      </div>

      {members.length > 0 && (
        <>
          <div className="rounded-lg border bg-white p-5">
            <MemberTable
              members={members}
              onUpdateMember={handleUpdateMember}
              totalGroups={estimatedGroups}
            />
          </div>

          <div className="space-y-5 rounded-lg border bg-white p-5">
              <GroupSettings
                settings={settings}
                onChange={handleSettingsChange}
                seriesList={seriesList}
                hasScores={hasScores}
                hasAges={hasAges}
                hasInterviewExperience={hasInterviewExperience}
                hasPreAssigned={hasPreAssigned}
              />
            <hr />
            <ForceAssignRules
              rules={settings.forceAssignRules}
              onChange={handleForceAssignRulesChange}
              seriesList={seriesList}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleAssign}
                className="rounded bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
              >
                {isRestored ? '복원본 다시 편성' : '자동 편성'}
              </button>

              {result && !isRestored && (
                <button
                  onClick={handleAssign}
                  className="rounded bg-gray-100 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
                >
                  다시 섞기
                </button>
              )}

              {result && <GroupExport groups={result.groups} examLabel={config.label} />}
            </div>

            {isRestored && (
              <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
                복원 결과를 불러왔습니다.
                <p className="mt-1 text-xs text-green-600">
                  현재는 사전 편성 적용이 꺼져 있어, &apos;복원본 다시 편성&apos;을 누르면 기존 조
                  번호를 고정하지 않고 새로 편성합니다.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {result && (
        <div className="rounded-lg border bg-white p-5">
          <GroupResult
            groups={result.groups}
            warnings={result.warnings}
            metrics={result.metrics}
            lockedMemberIds={result.lockedMemberIds}
          />
        </div>
      )}
    </div>
  );
}
