'use client';

import { ForceAssignRule } from '@/lib/study-group/types';

interface ForceAssignRulesProps {
  rules: ForceAssignRule[];
  onChange: (rules: ForceAssignRule[]) => void;
  seriesList: string[];
}

export default function ForceAssignRules({
  rules,
  onChange,
  seriesList,
}: ForceAssignRulesProps) {
  const addRule = () => {
    const availableSeries = seriesList.filter(
      (series) => !rules.some((rule) => rule.series === series)
    );
    if (availableSeries.length === 0) {
      return;
    }

    onChange([
      ...rules,
      {
        id: `rule-${Date.now()}`,
        series: availableSeries[0],
        countPerGroup: 1,
      },
    ]);
  };

  const updateRule = (id: string, updates: Partial<ForceAssignRule>) => {
    onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  const removeRule = (id: string) => {
    onChange(rules.filter((rule) => rule.id !== id));
  };

  const availableSeries = seriesList.filter(
    (series) => !rules.some((rule) => rule.series === series)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">강제 배정 규칙</h3>
        <button
          type="button"
          onClick={addRule}
          disabled={availableSeries.length === 0}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          + 규칙 추가
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-gray-400">
          특정 직렬을 모든 조에 일정 인원씩 고정하려면 규칙을 추가하세요.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-3 rounded bg-gray-50 p-3"
            >
              <select
                value={rule.series}
                onChange={(event) =>
                  updateRule(rule.id, { series: event.target.value })
                }
                className="flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={rule.series}>{rule.series}</option>
                {availableSeries.map((series) => (
                  <option key={series} value={series}>
                    {series}
                  </option>
                ))}
              </select>
              <span className="whitespace-nowrap text-xs text-gray-500">조당</span>
              <input
                type="number"
                min={1}
                max={10}
                value={rule.countPerGroup}
                onChange={(event) =>
                  updateRule(rule.id, {
                    countPerGroup: parseInt(event.target.value, 10) || 1,
                  })
                }
                className="w-16 rounded border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500">명</span>
              <button
                type="button"
                onClick={() => removeRule(rule.id)}
                className="px-1 text-sm text-red-500 hover:text-red-700"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
