import Button from "./ui/Button";

export default function RecommendationPopup({ recommendation, onAccept, onDismiss }) {
  if (!recommendation) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[#467ee5]">Quick Suggestion</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-800">{recommendation.name}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{recommendation.reason}</p>
        </div>
        <button onClick={onDismiss} className="text-slate-400 transition hover:text-slate-700">
          ✕
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-slate-400">ETA</div>
          <div className="mt-1 font-semibold text-slate-800">{recommendation.travelMinutes} min</div>
        </div>
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-slate-400">Distance</div>
          <div className="mt-1 font-semibold text-slate-800">{recommendation.distanceKm} km</div>
        </div>
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-slate-400">Cost</div>
          <div className="mt-1 font-semibold text-slate-800">₹{recommendation.chargingCost}</div>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <Button onClick={onAccept} className="flex-1">
          Use This
        </Button>
        <Button onClick={onDismiss} variant="secondary" className="flex-1">
          Dismiss
        </Button>
      </div>
    </div>
  );
}
