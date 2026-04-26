export default function Input({ label, error, className = "", ...props }) {
  return (
    <label className="block space-y-2">
      {label ? <span className="text-sm font-medium text-slate-600">{label}</span> : null}
      <input
        className={`w-full rounded-xl border border-[#d7dfeb] bg-[#f8fafc] px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#467ee5] focus:bg-white ${className}`}
        {...props}
      />
      {error ? <span className="text-sm text-rose-500">{error}</span> : null}
    </label>
  );
}
