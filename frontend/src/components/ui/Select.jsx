export default function Select({ label, error, options = [], className = "", ...props }) {
  return (
    <label className="block space-y-2">
      {label ? <span className="text-sm font-medium text-slate-600">{label}</span> : null}
      <select
        className={`w-full rounded-xl border border-[#d7dfeb] bg-[#f8fafc] px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#467ee5] focus:bg-white ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value ?? option} value={option.value ?? option}>
            {option.label ?? option}
          </option>
        ))}
      </select>
      {error ? <span className="text-sm text-rose-500">{error}</span> : null}
    </label>
  );
}
