export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3.5 pb-1 font-mono text-[8px] font-medium uppercase tracking-[0.12em] text-slate">
      <span>{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/5 to-transparent" />
    </div>
  );
}

export function FlowArrow({ children = '↓' }: { children?: React.ReactNode }) {
  return <div className="py-1.5 text-center font-mono text-[10px] text-slate opacity-40">{children}</div>;
}
