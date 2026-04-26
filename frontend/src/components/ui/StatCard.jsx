import Card from "./Card";

export default function StatCard({ label, value, change }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <h3 className="text-3xl font-semibold text-slate-800">{value}</h3>
        <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs text-[#467ee5]">{change}</span>
      </div>
    </Card>
  );
}
