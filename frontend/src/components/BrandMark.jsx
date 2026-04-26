export default function BrandMark({ compact = false }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      <svg
        width={compact ? "40" : "52"}
        height={compact ? "40" : "52"}
        viewBox="0 0 56 56"
      >
        <circle cx="28" cy="28" r="24" fill="#467ee5" />
        <path d="M16 28h24M28 16v24" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
        <circle cx="28" cy="28" r="10" stroke="#ffffff" strokeWidth="3" fill="none" />
      </svg>

      {!compact && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-slate-400">YATRA</div>
          <div className="text-lg font-semibold tracking-[0.12em] text-slate-800">MITRA</div>
        </div>
      )}
    </div>
  );
}
