import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import StationsLeafletMap from "../components/maps/StationsLeafletMap";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Loader from "../components/ui/Loader";
import { getAvailabilityTone } from "../utils/formatters";
import { getStationById } from "../services/stationService";

export default function StationDetails({ user, onLogout }) {
  const { stationId } = useParams();
  const [station, setStation] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getStationById(stationId)
      .then(setStation)
      .catch((err) => setError(err.message));
  }, [stationId]);

  return (
    <AppShell title="Station Details" user={user} onLogout={onLogout}>
      {!station && !error ? <Loader label="Loading station details..." /> : null}
      {error ? <Card className="text-rose-500">{error}</Card> : null}

      {station ? (
        <div className="space-y-6">
          <Card className="overflow-hidden p-0">
            <img src={station.image} alt={station.name} className="h-72 w-full object-cover" />
            <div className="p-6 pb-0">
              <StationsLeafletMap stations={[station]} heightClass="h-[280px]" />
            </div>
            <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className={`inline-flex rounded-full px-3 py-1 text-xs ${getAvailabilityTone(station.availability)}`}>{station.availability}</div>
                <h2 className="mt-4 text-3xl font-semibold text-slate-800">{station.name}</h2>
                <p className="mt-2 text-slate-500">{station.address}</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#f8fafc] p-4">
                    <div className="text-sm text-slate-400">Power Output</div>
                    <div className="mt-2 text-xl font-semibold text-slate-800">{station.powerOutput}</div>
                  </div>
                  <div className="rounded-2xl bg-[#f8fafc] p-4">
                    <div className="text-sm text-slate-400">Charging Price</div>
                    <div className="mt-2 text-xl font-semibold text-slate-800">₹{station.pricePerKwh}/kWh</div>
                  </div>
                  <div className="rounded-2xl bg-[#f8fafc] p-4">
                    <div className="text-sm text-slate-400">Open Hours</div>
                    <div className="mt-2 text-xl font-semibold text-slate-800">{station.openHours}</div>
                  </div>
                  <div className="rounded-2xl bg-[#f8fafc] p-4">
                    <div className="text-sm text-slate-400">Connector Count</div>
                    <div className="mt-2 text-xl font-semibold text-slate-800">{station.connectors}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Card>
                  <h3 className="text-lg font-semibold text-slate-800">Compatibility</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {station.chargerTypes.map((type) => (
                      <span key={type} className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs text-[#467ee5]">
                        {type}
                      </span>
                    ))}
                  </div>
                </Card>
                <Card>
                  <h3 className="text-lg font-semibold text-slate-800">Amenities</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {station.amenities.map((item) => (
                      <span key={item} className="rounded-full bg-[#f8fafc] px-3 py-1 text-xs text-slate-600">
                        {item}
                      </span>
                    ))}
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-slate-400">Distance</div>
                      <div className="text-xl font-semibold text-slate-800">{station.distanceKm} km away</div>
                    </div>
                    <Button as={Link} to={`/booking?stationId=${station.id}`}>
                      Reserve Slot
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
