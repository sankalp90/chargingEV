export default function Badge({ className = "", children }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-[#f1f5f9] px-3 py-1 text-xs text-slate-600 ${className}`}>
      {children}
    </span>
  );
}
