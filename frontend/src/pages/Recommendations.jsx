import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import StationsLeafletMap from "../components/maps/StationsLeafletMap";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Loader from "../components/ui/Loader";
import { getSmartRecommendations } from "../services/stationService";

export default function Recommendations({ user, onLogout }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getSmartRecommendations()
      .then(setRecommendations)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell title="Smart Recommendations" user={user} onLogout={onLogout}>
      {loading ? <Loader label="Building recommendations..." /> : null}
      {error ? <Card className="text-rose-500">{error}</Card> : null}

      {!loading ? (
        <div className="space-y-5">
          <Card className="p-0">
            <StationsLeafletMap stations={recommendations} heightClass="h-[360px]" />
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            {recommendations.map((station, index) => (
              <Card key={station.id} className="overflow-hidden p-0">
                <div className="grid h-full md:grid-cols-[0.85fr_1.15fr]">
                  <img src={station.image} alt={station.name} className="h-full min-h-56 w-full object-cover" />
                  <div className="space-y-4 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Recommendation {index + 1}</p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-800">{station.name}</h3>
                      </div>
                      <div className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs text-[#467ee5]">
                        Score {Math.round(station.score)}
                      </div>
                    </div>
                    <p className="text-sm text-slate-500">{station.location}</p>
                    <div className="rounded-2xl bg-[#f8fafc] p-4 text-sm text-slate-600">
                      <div className="font-medium text-slate-800">Why this station?</div>
                      <div className="mt-2">{station.matchReason}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm text-slate-600">
                      <div>
                        <div className="text-slate-400">Distance</div>
                        <div>{station.distanceKm} km</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Rating</div>
                        <div>{station.rating}/5</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Price</div>
                        <div>₹{station.pricePerKwh}/kWh</div>
                      </div>
                    </div>
                    <Button as={Link} to={`/booking?stationId=${station.id}`}>
                      Book This Station
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
