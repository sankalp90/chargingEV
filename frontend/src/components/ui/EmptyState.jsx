export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-3xl bg-white px-6 py-12 text-center shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
