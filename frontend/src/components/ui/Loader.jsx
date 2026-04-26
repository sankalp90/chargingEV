export default function Loader({ label = "Loading..." }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 text-slate-500">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#d7dfeb] border-t-[#467ee5]" />
      <p>{label}</p>
    </div>
  );
}
