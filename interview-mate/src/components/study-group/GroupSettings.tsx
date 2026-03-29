'use client';

import { DEFAULT_PENALTY_WEIGHTS } from '@/lib/study-group/config';
import {
  GroupSettings as GroupSettingsType,
  PenaltyWeights,
} from '@/lib/study-group/types';

interface GroupSettingsProps {
  settings: GroupSettingsType;
  onChange: (settings: GroupSettingsType) => void;
  seriesList: string[];
  hasScores: boolean;
  hasAges: boolean;
  hasPreAssigned: boolean;
}

interface ToggleRowProps {
  checked: boolean;
  label: string;
  description: string;
  weight?: number;
  onChange: (checked: boolean) => void;
}

function ToggleRow({
  checked,
  label,
  description,
  weight,
  onChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
      <label className="relative mt-0.5 inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
      </label>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{label}</span>
          {checked && typeof weight === 'number' && (
            <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
              가중치 {weight}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
      </div>
    </div>
  );
}

export default function GroupSettings({
  settings,
  onChange,
  seriesList,
  hasScores,
  hasAges,
  hasPreAssigned,
}: GroupSettingsProps) {
  const togglePenalty = (key: keyof PenaltyWeights, enabled: boolean) => {
    onChange({
      ...settings,
      penaltyWeights: {
        ...settings.penaltyWeights,
        [key]: enabled ? DEFAULT_PENALTY_WEIGHTS[key] : 0,
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">편성 설정</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">조당 최소 인원</label>
            <input
              type="number"
              min={2}
              max={settings.groupSize.max}
              value={settings.groupSize.min}
              onChange={(event) =>
                onChange({
                  ...settings,
                  groupSize: {
                    ...settings.groupSize,
                    min: parseInt(event.target.value, 10) || 2,
                  },
                })
              }
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">조당 최대 인원</label>
            <input
              type="number"
              min={settings.groupSize.min}
              max={30}
              value={settings.groupSize.max}
              onChange={(event) =>
                onChange({
                  ...settings,
                  groupSize: {
                    ...settings.groupSize,
                    max: parseInt(event.target.value, 10) || 10,
                  },
                })
              }
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-500">성비</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...settings,
                  genderRatio: { mode: 'auto' },
                })
              }
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                settings.genderRatio.mode === 'auto'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              자동
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...settings,
                  genderRatio: {
                    mode: 'manual',
                    maleRatio: settings.genderRatio.maleRatio ?? 7,
                    femaleRatio: settings.genderRatio.femaleRatio ?? 3,
                  },
                })
              }
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                settings.genderRatio.mode === 'manual'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              수동
            </button>
          </div>

          {settings.genderRatio.mode === 'manual' && (
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-gray-500">남</label>
              <input
                type="number"
                min={0}
                max={10}
                value={settings.genderRatio.maleRatio ?? 7}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    genderRatio: {
                      ...settings.genderRatio,
                      maleRatio: parseInt(event.target.value, 10) || 0,
                    },
                  })
                }
                className="w-16 rounded border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400">:</span>
              <label className="text-xs text-gray-500">여</label>
              <input
                type="number"
                min={0}
                max={10}
                value={settings.genderRatio.femaleRatio ?? 3}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    genderRatio: {
                      ...settings.genderRatio,
                      femaleRatio: parseInt(event.target.value, 10) || 0,
                    },
                  })
                }
                className="w-16 rounded border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {hasPreAssigned && (
          <ToggleRow
            checked={settings.usePreAssignment}
            label="사전 편성 적용"
            description="이미 조가 지정된 멤버를 해당 조에 고정하고, 나머지 인원만 자동 배정합니다."
            onChange={(checked) =>
              onChange({
                ...settings,
                usePreAssignment: checked,
              })
            }
          />
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">최적화 기준</h3>
          <p className="mt-1 text-xs text-gray-500">
            토글을 끄면 해당 기준의 페널티를 0으로 두고 최적화합니다.
          </p>
        </div>

        <ToggleRow
          checked={settings.penaltyWeights.gender > 0}
          label="성별 혼합"
          description="조별 여성 비율이 전체 성비 또는 수동 성비에 가깝도록 맞춥니다."
          weight={DEFAULT_PENALTY_WEIGHTS.gender}
          onChange={(checked) => togglePenalty('gender', checked)}
        />

        {hasAges && (
          <ToggleRow
            checked={settings.penaltyWeights.ageBracket > 0}
            label="나이 구간 분산"
            description="A(~24), B(25~27), C(28~30), D(31+)가 한 조에 과도하게 몰리지 않도록 조정합니다."
            weight={DEFAULT_PENALTY_WEIGHTS.ageBracket}
            onChange={(checked) => togglePenalty('ageBracket', checked)}
          />
        )}

        <ToggleRow
          checked={settings.penaltyWeights.region > 0}
          label="지역 분산"
          description={
            settings.examType === 'fire'
              ? '같은 지역 + 같은 성별이 한 조에 몰리지 않도록 분산합니다. (같은 지역이라도 성별이 다르면 허용)'
              : '같은 지역 출신이 한 조에 몰리지 않도록 분산합니다. (남녀통합 면접이므로 성별 무관)'
          }
          weight={DEFAULT_PENALTY_WEIGHTS.region}
          onChange={(checked) => togglePenalty('region', checked)}
        />

        <ToggleRow
          checked={settings.penaltyWeights.series > 0}
          label="직렬 분산"
          description="같은 직렬이 한 조에 과도하게 몰리지 않도록 균형을 맞춥니다."
          weight={DEFAULT_PENALTY_WEIGHTS.series}
          onChange={(checked) => togglePenalty('series', checked)}
        />

        {hasScores && (
          <ToggleRow
            checked={settings.penaltyWeights.score > 0}
            label="성적 균등"
            description="조별 평균 성적 편차가 줄어들도록 스왑 최적화를 수행합니다."
            weight={DEFAULT_PENALTY_WEIGHTS.score}
            onChange={(checked) => togglePenalty('score', checked)}
          />
        )}
      </div>

      {seriesList.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">짝수 배치 필수 직렬</h3>
            <p className="mt-1 text-xs text-gray-500">
              선택된 직렬은 한 조에 0명 또는 2명 이상 배치됩니다. (1명만 단독 배치 방지)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {seriesList.map((series) => {
              const isSelected = settings.pairRequiredSeries.includes(series);
              return (
                <button
                  key={series}
                  type="button"
                  onClick={() => {
                    const next = isSelected
                      ? settings.pairRequiredSeries.filter((s) => s !== series)
                      : [...settings.pairRequiredSeries, series];
                    onChange({ ...settings, pairRequiredSeries: next });
                  }}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {series}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
