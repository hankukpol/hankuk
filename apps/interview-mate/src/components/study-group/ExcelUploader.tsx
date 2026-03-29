'use client';

import { useCallback, useState } from 'react';
import { downloadCsvTemplate, parseExcel } from '@/lib/study-group/excel';
import { Member, StudyGroup } from '@/lib/study-group/types';
import TextPasteInput from './TextPasteInput';

type InputTab = 'excel' | 'text';

interface ExcelUploaderProps {
  onUpload: (members: Member[], restoredGroups?: StudyGroup[]) => void;
}

export default function ExcelUploader({ onUpload }: ExcelUploaderProps) {
  const [tab, setTab] = useState<InputTab>('excel');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (
        !file.name.endsWith('.xlsx') &&
        !file.name.endsWith('.xls') &&
        !file.name.endsWith('.csv')
      ) {
        setError('엑셀 파일(.xlsx, .xls) 또는 CSV 파일만 업로드할 수 있습니다.');
        return;
      }

      setLoading(true);
      setError(null);
      setFileName(file.name);

      try {
        const result = await parseExcel(file);
        if (result.members.length === 0) {
          setError('파일에서 읽을 수 있는 데이터가 없습니다.');
          return;
        }
        onUpload(result.members, result.restoredGroups);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : '파일을 처리하는 중 오류가 발생했습니다.'
        );
      } finally {
        setLoading(false);
      }
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);

      const file = event.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700">명단 입력</label>
        <button
          onClick={downloadCsvTemplate}
          className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
        >
          CSV 양식 다운로드
        </button>
      </div>

      <div className="flex border-b">
        <button
          onClick={() => setTab('excel')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'excel'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          파일 업로드
        </button>
        <button
          onClick={() => setTab('text')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'text'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          텍스트 붙여넣기
        </button>
      </div>

      {tab === 'excel' && (
        <>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onClick={() => document.getElementById('excel-input')?.click()}
          >
            <input
              id="excel-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleChange}
              className="hidden"
            />

            {loading ? (
              <p className="text-gray-500">파일을 읽는 중입니다...</p>
            ) : fileName ? (
              <div>
                <p className="text-sm text-gray-600">업로드한 파일</p>
                <p className="font-medium text-blue-600">{fileName}</p>
                <p className="mt-1 text-xs text-gray-400">
                  다른 파일을 올리려면 다시 클릭하거나 드래그하세요.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-gray-500">
                  엑셀 또는 CSV 파일을 드래그하거나 클릭해서 업로드하세요.
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  권장 열: 이름, 연락처, 성별, 직렬, 지역, 나이, 필기성적, 조
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
          )}
        </>
      )}

      {tab === 'text' && <TextPasteInput onApply={onUpload} />}
    </div>
  );
}
