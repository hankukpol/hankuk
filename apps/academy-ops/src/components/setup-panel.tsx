type SetupPanelProps = {
  title: string;
  description: string;
  missingKeys: string[];
};

export function SetupPanel({ title, description, missingKeys }: SetupPanelProps) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white/90 p-8 shadow-panel">
      <div className="mb-6 inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        Environment Setup Needed
      </div>
      <h2 className="text-2xl font-semibold text-ink">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate">{description}</p>
      <div className="mt-6 rounded-2xl bg-ink px-5 py-4 text-sm text-white">
        <p className="font-semibold">누락된 환경 변수</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {missingKeys.map((key) => (
            <span
              key={key}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1 font-mono text-xs"
            >
              {key}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 text-sm text-slate">
        `.env.local`은 [`.env.example`](./.env.example) 값을 기준으로 채우면 됩니다.
      </p>
    </div>
  );
}
