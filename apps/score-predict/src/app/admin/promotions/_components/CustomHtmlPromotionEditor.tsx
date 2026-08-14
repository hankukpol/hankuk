"use client";

import { useRef } from "react";

export default function CustomHtmlPromotionEditor({
  value,
  onChange,
  onPreview,
}: {
  value: string;
  onChange: (value: string) => void;
  onPreview: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function readHtmlFile(file: File) {
    onChange(await file.text());
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-950">HTML/CSS 랜딩 코드</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          피그마에서 내보낸 HTML과 CSS를 붙여 넣으세요. 외부 스타일시트와 상대경로 이미지는
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">base href</code>
          기준으로 변환됩니다.
        </p>
      </div>

      <div className="border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        JavaScript, iframe, 폼 실행과 HTML 이벤트 속성은 게시할 때 제거됩니다. 사전등록 모달 버튼은
        <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">href=&quot;#pre-registration&quot;</code>
        로 연결할 수 있습니다.
      </div>

      <div className="border-l-2 border-service-600 bg-service-50 px-4 py-3 text-sm leading-6 text-slate-800">
        별도 JavaScript 없이
        <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">data-aos=&quot;fade-up&quot;</code>
        과
        <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">data-aos-delay=&quot;180&quot;</code>
        를 사용하면 화면 진입 애니메이션이 적용됩니다. 계속 떠 있는 이미지는
        <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">data-motion=&quot;float&quot;</code>
        를 지정하세요. 사용자의 모션 줄이기 설정에서는 효과가 자동으로 정지합니다.
      </div>

      <label className="grid gap-2 text-sm font-semibold text-slate-800">
        <span>전체 HTML/CSS 코드</span>
        <textarea
          aria-label="전체 HTML/CSS 코드"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="min-h-[520px] w-full resize-y rounded-md border border-slate-300 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none transition focus:border-service-600 focus:ring-2 focus:ring-service-100"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-xs tabular-nums text-slate-500">{value.length.toLocaleString("ko-KR")}자</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept=".html,.htm,.txt,text/html,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readHtmlFile(file);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600"
            onClick={() => fileInputRef.current?.click()}
          >
            HTML 파일 불러오기
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md bg-service-700 px-4 text-sm font-semibold text-white transition hover:bg-service-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600 focus-visible:ring-offset-2"
            onClick={onPreview}
          >
            코드 확인
          </button>
        </div>
      </div>
    </section>
  );
}
