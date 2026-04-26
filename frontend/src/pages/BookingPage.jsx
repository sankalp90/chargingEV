import { useEffect, useMemo, useState, useTransition } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import RecommendationPopup from "../components/RecommendationPopup";
import RouteSketchMap from "../components/RouteSketchMap";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Loader from "../components/ui/Loader";
import Select from "../components/ui/Select";
import Textarea from "../components/ui/Textarea";
import { createBooking, getAvailableSlots } from "../services/bookingService";
import { defaultUserLocation, getBestStationForRoute, getStations } from "../services/stationService";
import { getRecommendationReason, getRouteSummary, getStationFitScore } from "../utils/geo";
import { formatCurrency } from "../utils/formatters";
import { validateBookingForm } from "../utils/validators";

export default function BookingPage({ user, onLogout }) {
  const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stationId = searchParams.get("stationId") || "";
  const [stations, setStations] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState("");
  const [locationLabel, setLocationLabel] = useState(
    typeof navigator !== "undefined" && navigator.geolocation
      ? "Fetching your location..."
      : `Using fallback location: ${defaultUserLocation.label}`
  );
  const [currentLocation, setCurrentLocation] = useState(defaultUserLocation);
  const [popupRecommendation, setPopupRecommendation] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    stationId,
    date: defaultDate,
    slot: "",
    chargerType: "CCS2",
    energyNeeded: 24,
    vehicleNumber: user?.vehicleNumber || "",
    notes: "",
  });

  useEffect(() => {
    getStations()
      .then((data) => {
        setStations(data);
        const fallback = stationId || data[0]?.id || "";
        setSelectedStation(fallback);
        setForm((current) => ({ ...current, stationId: fallback }));
      })
      .catch((err) => setFormError(err.message))
      .finally(() => setLoading(false));
  }, [stationId]);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Live device location",
        });
        setLocationLabel("Using your live location");
      },
      () => {
        setLocationLabel(`Using fallback location: ${defaultUserLocation.label}`);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, []);

  useEffect(() => {
    const currentStationId = form.stationId || selectedStation;
    if (!currentStationId) return;
    const currentStation = stations.find((item) => item.id === currentStationId);

    getAvailableSlots(currentStationId, currentStation)
      .then(setSlots)
      .catch((err) => setFormError(err.message));
  }, [form.stationId, selectedStation, stations]);

  useEffect(() => {
    if (!stations.length) return;

    getBestStationForRoute({ origin: currentLocation, energyNeeded: Number(form.energyNeeded || 0) })
      .then((station) => {
        if (!station) return;
        setPopupRecommendation({
          ...station,
          reason: getRecommendationReason(station, station),
        });
      })
      .catch(() => {});
  }, [stations, currentLocation, form.energyNeeded]);

  const station = stations.find((item) => item.id === form.stationId);
  const route = station ? getRouteSummary(currentLocation, station, Number(form.energyNeeded || 0)) : null;

  const rankedStations = useMemo(
    () =>
      stations
        .map((item) => ({ ...item, ...getStationFitScore(item, currentLocation, Number(form.energyNeeded || 0)) }))
        .sort((left, right) => right.score - left.score),
    [stations, currentLocation, form.energyNeeded]
  );

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => {
      if (field === "stationId") {
        const nextStation = stations.find((item) => item.id === value);
        return {
          ...current,
          stationId: value,
          chargerType: nextStation?.chargerTypes.includes(current.chargerType)
            ? current.chargerType
            : (nextStation?.chargerTypes[0] ?? current.chargerType),
        };
      }

      return { ...current, [field]: value };
    });
    setErrors((current) => ({ ...current, [field]: "" }));
    if (field === "stationId") setSelectedStation(value);
  };

  const handleUseRecommendation = () => {
    if (!popupRecommendation) return;
    setForm((current) => ({
      ...current,
      stationId: popupRecommendation.id,
      chargerType: popupRecommendation.chargerTypes[0],
    }));
    setSelectedStation(popupRecommendation.id);
    setPopupRecommendation(null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const validationErrors = validateBookingForm(form);
    setErrors(validationErrors);
    setFormError("");

    if (Object.keys(validationErrors).length > 0) return;

    startTransition(async () => {
      try {
        await createBooking({
          ...form,
          energyNeeded: Number(form.energyNeeded),
          stationSnapshot: station,
        });
        navigate("/bookings");
      } catch (error) {
        setFormError(error.message);
      }
    });
  };

  const mapPoints = [
    { id: "user", kind: "user", lat: currentLocation.lat, lng: currentLocation.lng, label: currentLocation.label },
    ...rankedStations.slice(0, 4).map((item) => ({
      id: item.id,
      lat: item.lat,
      lng: item.lng,
      label: item.name,
      shortLabel: item.city,
    })),
  ];

  return (
    <AppShell title="Book Charging Slot" user={user} onLogout={onLogout}>
      {loading ? <Loader label="Preparing booking form..." /> : null}

      {!loading ? (
        <div className="space-y-8">
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className="rounded-[38px] bg-white px-8 py-8 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="max-w-2xl">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Route-aware booking</p>
                    <h2 className="mt-3 text-4xl font-semibold leading-[1.12] text-slate-900">
                      Pick the station that saves both time on the road and money on the charger.
                    </h2>
                    <p className="mt-4 max-w-xl text-base leading-8 text-slate-500">
                      We estimate route time from your location, compare likely spend, and surface the station that feels smartest right now.
                    </p>
                  </div>
                  <div className="rounded-[26px] bg-[#edf4ff] px-5 py-4 text-sm text-slate-600">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Tracked from</div>
                    <div className="mt-2 max-w-[220px] font-medium text-slate-800">{locationLabel}</div>
                  </div>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <div className="rounded-[26px] bg-[#f8fafc] p-5">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Best current pick</div>
                    <div className="mt-3 text-xl font-semibold text-slate-900">{rankedStations[0]?.name || "Calculating..."}</div>
                    <div className="mt-2 text-sm text-slate-500">{rankedStations[0]?.city || "Preparing route score"}</div>
                  </div>
                  <div className="rounded-[26px] bg-[#f8fafc] p-5">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Approx. route time</div>
                    <div className="mt-3 text-xl font-semibold text-slate-900">{route ? `${route.travelMinutes} min` : "--"}</div>
                    <div className="mt-2 text-sm text-slate-500">Estimated from your current position</div>
                  </div>
                  <div className="rounded-[26px] bg-[#f8fafc] p-5">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Charging spend</div>
                    <div className="mt-3 text-xl font-semibold text-slate-900">{route ? formatCurrency(route.chargingCost) : "--"}</div>
                    <div className="mt-2 text-sm text-slate-500">Based on selected energy requirement</div>
                  </div>
                </div>
              </div>

              <Card className="rounded-[38px] p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Live route sketch</p>
                    <h3 className="mt-2 text-2xl font-semibold text-slate-900">Your position against the strongest station options.</h3>
                  </div>
                  {route ? <div className="text-sm text-slate-500">{route.distanceKm} km to selected station</div> : null}
                </div>

                <div className="mt-6">
                  <RouteSketchMap points={mapPoints} activeId={form.stationId} />
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {rankedStations.slice(0, 3).map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setForm((current) => ({ ...current, stationId: item.id, chargerType: item.chargerTypes[0] }));
                        setSelectedStation(item.id);
                      }}
                      className={`rounded-[24px] p-4 text-left transition ${
                        form.stationId === item.id ? "bg-[#e9f1ff]" : "bg-[#f8fafc] hover:bg-[#f1f5f9]"
                      }`}
                    >
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Choice {index + 1}</div>
                      <div className="mt-2 font-semibold text-slate-900">{item.name}</div>
                      <div className="mt-1 text-sm text-slate-500">{item.travelMinutes} min away • ₹{item.chargingCost}</div>
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="rounded-[38px] p-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <Select
                      label="Station"
                      value={form.stationId}
                      onChange={handleChange("stationId")}
                      options={stations.map((item) => ({ value: item.id, label: `${item.name} • ${item.city}` }))}
                    />
                    <Input label="Charging Date" type="date" value={form.date} onChange={handleChange("date")} error={errors.date} />
                    <Select
                      label="Connector Type"
                      value={form.chargerType}
                      onChange={handleChange("chargerType")}
                      options={(station?.chargerTypes || ["CCS2"]).map((type) => ({ value: type, label: type }))}
                    />
                    <Input label="Energy Needed (kWh)" type="number" min="1" value={form.energyNeeded} onChange={handleChange("energyNeeded")} error={errors.energyNeeded} />
                    <Input label="Vehicle Number" value={form.vehicleNumber} onChange={handleChange("vehicleNumber")} error={errors.vehicleNumber} placeholder="MP04EV2026" />
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-600">Available Time Slots</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {slots.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => setForm((current) => ({ ...current, slot: slot.id }))}
                          className={`rounded-[20px] px-4 py-3 text-sm transition ${
                            form.slot === slot.id
                              ? "bg-[#e9f1ff] text-[#467ee5]"
                              : slot.available
                                ? "bg-[#f8fafc] text-slate-700 hover:bg-[#eef2f7]"
                                : "cursor-not-allowed bg-[#f1f5f9] text-slate-400"
                          }`}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                    {errors.slot ? <p className="mt-2 text-sm text-rose-500">{errors.slot}</p> : null}
                  </div>

                  <Textarea label="Special Notes" value={form.notes} onChange={handleChange("notes")} placeholder="Any route or battery notes for the station team" />

                  {formError ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-500">{formError}</div> : null}

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={isPending} className="rounded-full px-6">
                      {isPending ? "Confirming..." : "Confirm Booking"}
                    </Button>
                    <Button as={Link} to="/stations" variant="secondary" className="rounded-full px-6">
                      Compare all stations
                    </Button>
                  </div>
                </form>
              </Card>

              <Card className="rounded-[38px] p-6">
                <h3 className="text-xl font-semibold text-slate-900">Selected station economics</h3>
                {station ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-[24px] bg-[#d9edff] p-5">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{station.city}</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{station.name}</div>
                      <div className="mt-2 text-sm text-slate-600">{station.location}</div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[22px] bg-[#f8fafc] p-4">
                        <div className="text-sm text-slate-400">Approx. travel time</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">{route?.travelMinutes ?? "--"} min</div>
                      </div>
                      <div className="rounded-[22px] bg-[#f8fafc] p-4">
                        <div className="text-sm text-slate-400">Approx. charging cost</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">{route ? formatCurrency(route.chargingCost) : "--"}</div>
                      </div>
                      <div className="rounded-[22px] bg-[#f8fafc] p-4">
                        <div className="text-sm text-slate-400">Distance from you</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">{route?.distanceKm ?? "--"} km</div>
                      </div>
                      <div className="rounded-[22px] bg-[#f8fafc] p-4">
                        <div className="text-sm text-slate-400">Charger speed</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">{station.powerOutput}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>
          </section>
        </div>
      ) : null}

      <RecommendationPopup
        recommendation={popupRecommendation}
        onAccept={handleUseRecommendation}
        onDismiss={() => setPopupRecommendation(null)}
      />
    </AppShell>
  );
}
