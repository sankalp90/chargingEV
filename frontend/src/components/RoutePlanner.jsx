import { useEffect, useMemo, useState } from "react";
import RoutePlannerMap from "./maps/RoutePlannerMap";
import Button from "./ui/Button";
import Card from "./ui/Card";
import Input from "./ui/Input";
import { getBulkStationAvailability, getStationsAlongRoute } from "../services/stationService";
import { planTripStops } from "../services/tripPlannerService";
import { createBulkBooking, ensureBackendStationId } from "../services/bookingService";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";

function formatDistance(km) {
  return `${km.toFixed(2)} km`;
}

function formatDuration(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hrs <= 0) return `${mins} min`;
  return `${hrs} hr ${mins} min`;
}

export default function RoutePlanner() {
  const [startLocation, setStartLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeDetails, setRouteDetails] = useState({ distanceKm: 0, durationMin: 0 });
  const [nearbyStations, setNearbyStations] = useState([]);
  const [vehicleRangeKm, setVehicleRangeKm] = useState(300);
  const [batteryPercent, setBatteryPercent] = useState(80);
  const [averageSpeedKmph, setAverageSpeedKmph] = useState(45);
  const [bufferMinutes, setBufferMinutes] = useState(20);
  const [plannedStops, setPlannedStops] = useState([]);
  const [radiusKm, setRadiusKm] = useState(5);
  const [startPoint, setStartPoint] = useState(null);
  const [destinationPoint, setDestinationPoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState("");
  const [bookingMessage, setBookingMessage] = useState("");
  const [failedBookings, setFailedBookings] = useState([]);

  const nearbyStationMap = useMemo(
    () => new Map(nearbyStations.map((station) => [String(station.station_id), station])),
    [nearbyStations]
  );

  const parseSlotTimes = (slotLabel, referenceDateIso) => {
    const value = String(slotLabel || "").trim();
    const normalized = value.replace(/\s+/g, " ");
    const [startRaw, endRaw] = normalized.split("-").map((part) => part.trim());
    if (!startRaw || !endRaw) return null;

    const parseClock = (input) => {
      const upper = input.toUpperCase();
      const hasPm = upper.includes("PM");
      const hasAm = upper.includes("AM");
      const clean = upper.replace("AM", "").replace("PM", "").trim();
      const [hoursText, minutesText] = clean.split(":");
      let hours = Number(hoursText);
      const minutes = Number(minutesText || 0);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
      if (hasPm && hours < 12) hours += 12;
      if (hasAm && hours === 12) hours = 0;
      return { hours, minutes };
    };

    const startClock = parseClock(startRaw);
    const endClock = parseClock(endRaw);
    if (!startClock || !endClock) return null;

    const date = new Date(referenceDateIso);
    const startTime = new Date(date);
    startTime.setHours(startClock.hours, startClock.minutes, 0, 0);
    const endTime = new Date(date);
    endTime.setHours(endClock.hours, endClock.minutes, 0, 0);
    return { startTime, endTime };
  };

  const suggestSlotForTime = (slots, targetIsoTime) => {
    if (!slots?.length) return "";
    const target = new Date(targetIsoTime);
    if (Number.isNaN(target.getTime())) return slots[0].id;

    let best = null;
    slots.forEach((slot) => {
      const parsed = parseSlotTimes(slot.label || slot.id, targetIsoTime);
      if (!parsed) return;
      const { startTime, endTime } = parsed;
      const containsTarget = startTime <= target && endTime >= target;
      const distanceMinutes = containsTarget
        ? 0
        : Math.abs(startTime.getTime() - target.getTime()) / (1000 * 60);
      const startsAfter = startTime >= target;
      const rank = containsTarget ? 3 : startsAfter ? 2 : 1;

      if (
        !best ||
        rank > best.rank ||
        (rank === best.rank && distanceMinutes < best.distanceMinutes)
      ) {
        best = { id: slot.id, rank, distanceMinutes };
      }
    });
    return best?.id || slots[0].id;
  };

  const refreshStopAvailability = async (baseStops) => {
    if (!baseStops.length) {
      setPlannedStops([]);
      return;
    }

    const importedStops = await Promise.all(
      baseStops.map(async (stop) => {
        const snapshot = stop.station_snapshot || {
          name: stop.name,
          lat: stop.location?.lat,
          lng: stop.location?.lng,
          city: stop.city || "Unknown",
        };

        try {
          const backendStationId = await ensureBackendStationId(stop.station_id, snapshot);
          return {
            ...stop,
            station_id: backendStationId,
            station_snapshot: snapshot,
          };
        } catch {
          // Do not block whole route planning if one station import fails.
          return {
            ...stop,
            station_snapshot: snapshot,
          };
        }
      })
    );

    const availability = await getBulkStationAvailability({
      stationIds: importedStops.map((stop) => stop.station_id),
      estimatedArrivalTimes: importedStops.map((stop) => stop.estimated_arrival_time),
      windowMinutes: 60,
    });
    const availabilityMap = new Map(availability.map((entry) => [String(entry.station_id), entry.available_slots || []]));

    setPlannedStops(
      importedStops.map((stop) => {
        const slots = availabilityMap.get(String(stop.station_id)) || [];
        const suggestedSlotId = suggestSlotForTime(slots, stop.booking_target_time || stop.estimated_arrival_time);
        return {
          ...stop,
          available_slots: slots,
          slot_id: stop.slot_id && slots.some((slot) => slot.id === stop.slot_id) ? stop.slot_id : suggestedSlotId,
        };
      })
    );
  };

  const recalculateStops = async ({ routeDistanceKm, routeDurationMin, routePoints, stations }) => {
    let suggestions = [];
    try {
      suggestions = planTripStops({
        vehicleRangeKm,
        currentBatteryPercent: batteryPercent,
        routeDistanceKm,
        routeCoordinates: routePoints,
        stationsAlongRoute: stations.map((station) => ({ ...station, rating: station.rating ?? 4.2 })),
      });
    } catch (plannerError) {
      setError(plannerError.message);
      setPlannedStops([]);
      return;
    }

    const departureTime = new Date();
    const enrichedStops = suggestions.map((stop) => {
      const station = nearbyStationMap.get(String(stop.station_id)) || stations.find((item) => String(item.station_id) === String(stop.station_id));
      const speedBasedMinutes = (stop.distance_from_start / Math.max(averageSpeedKmph, 1)) * 60;
      const routeBasedMinutes = routeDistanceKm > 0 ? (stop.distance_from_start / routeDistanceKm) * routeDurationMin : 0;
      const arrivalMinutes = Math.max(speedBasedMinutes, routeBasedMinutes);
      const eta = new Date(departureTime.getTime() + Math.max(0, arrivalMinutes) * 60 * 1000);
      const bookingTarget = new Date(eta.getTime() + Math.max(0, bufferMinutes) * 60 * 1000);

      return {
        ...stop,
        name: station?.name || `Station ${stop.station_id}`,
        city: station?.city || "Unknown",
        location: station?.location || { lat: 0, lng: 0 },
        distance_from_route: station?.distance_from_route ?? 0,
        station_snapshot: station || null,
        estimated_arrival_time: eta.toISOString(),
        booking_target_time: bookingTarget.toISOString(),
        available_slots: [],
        slot_id: "",
      };
    });

    await refreshStopAvailability(enrichedStops);
  };

  const geocodeLocation = async (query) => {
    const url = `${NOMINATIM_BASE_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Could not fetch location coordinates.");
    }

    const data = await response.json();
    if (!data.length) {
      throw new Error(`No location found for "${query}".`);
    }

    return {
      lat: Number(data[0].lat),
      lng: Number(data[0].lon),
      label: data[0].display_name,
    };
  };

  const fetchRoute = async (startCoords, destinationCoords) => {
    const url = `${OSRM_BASE_URL}/${startCoords.lng},${startCoords.lat};${destinationCoords.lng},${destinationCoords.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Route service is unavailable right now.");
    }

    const data = await response.json();
    if (!data?.routes?.length) {
      throw new Error("No route found between selected locations.");
    }

    const route = data.routes[0];
    const coordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

    return {
      coordinates,
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
    };
  };

  const handleRouteSearch = async (event) => {
    event.preventDefault();
    const validRadius = Math.max(1, Number(radiusKm) || 1);

    if (!startLocation.trim() || !destination.trim()) {
      setError("Please enter both start location and destination.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [startCoords, destinationCoords] = await Promise.all([
        geocodeLocation(startLocation),
        geocodeLocation(destination),
      ]);

      const route = await fetchRoute(startCoords, destinationCoords);
      const stationsOnRoute = await getStationsAlongRoute({
        routeCoordinates: route.coordinates,
        radiusKm: validRadius,
      });

      setStartPoint(startCoords);
      setDestinationPoint(destinationCoords);
      setRouteCoordinates(route.coordinates);
      setRouteDetails({ distanceKm: route.distanceKm, durationMin: route.durationMin });
      setNearbyStations(stationsOnRoute);
      setBookingMessage("");
      await recalculateStops({
        routeDistanceKm: route.distanceKm,
        routeDurationMin: route.durationMin,
        routePoints: route.coordinates,
        stations: stationsOnRoute,
      });
    } catch (err) {
      setError(err.message || "Unable to fetch route.");
      setRouteCoordinates([]);
      setRouteDetails({ distanceKm: 0, durationMin: 0 });
      setNearbyStations([]);
      setPlannedStops([]);
      setStartPoint(null);
      setDestinationPoint(null);
    } finally {
      setLoading(false);
    }
  };

  const handleStationChange = async (stopOrder, stationId) => {
    const station = nearbyStationMap.get(String(stationId));
    const updated = plannedStops.map((stop) => {
      if (stop.stop_order !== stopOrder) return stop;
      return {
        ...stop,
        station_id: Number(stationId),
        name: station?.name || stop.name,
        city: station?.city || stop.city || "Unknown",
        location: station?.location || stop.location,
        distance_from_route: station?.distance_from_route ?? stop.distance_from_route,
        station_snapshot: station || stop.station_snapshot || null,
        slot_id: "",
      };
    });
    await refreshStopAvailability(updated);
  };

  const handleSlotChange = (stopOrder, slotId) => {
    setPlannedStops((current) =>
      current.map((stop) => (stop.stop_order === stopOrder ? { ...stop, slot_id: slotId } : stop))
    );
  };

  const handleRecalculateStops = async () => {
    if (!routeCoordinates.length || !nearbyStations.length) return;
    setError("");
    setLoading(true);
    try {
      await recalculateStops({
        routeDistanceKm: routeDetails.distanceKm,
        routeDurationMin: routeDetails.durationMin,
        routePoints: routeCoordinates,
        stations: nearbyStations,
      });
    } catch (refreshError) {
      setError(refreshError.message || "Unable to update stops.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!routeCoordinates.length || !nearbyStations.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleRecalculateStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleRangeKm, batteryPercent, averageSpeedKmph, bufferMinutes]);

  const handleBookEntireTrip = async () => {
    if (!plannedStops.length) {
      setBookingMessage("No planned stops to book.");
      return;
    }
    const missingSlot = plannedStops.find((stop) => !stop.slot_id);
    if (missingSlot) {
      setBookingMessage(`Please select a slot for stop ${missingSlot.stop_order}.`);
      return;
    }

    try {
      setBookingLoading(true);
      setBookingMessage("");
      setFailedBookings([]);
      const payload = plannedStops.map((stop) => {
        const parsed = parseSlotTimes(stop.slot_id, stop.estimated_arrival_time);
        const start = parsed?.startTime || new Date(stop.estimated_arrival_time);
        const end = parsed?.endTime || new Date(start.getTime() + 60 * 60 * 1000);
        return {
          station_id: stop.station_id,
          slot_id: stop.slot_id,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
        };
      });

      const response = await createBulkBooking({ bookings: payload, allowPartial: true });
      if (response?.success && response?.partial) {
        setFailedBookings(response.failed_bookings || []);
        setBookingMessage(
          `Booked ${response.booking_ids?.length || 0} stops. ${response.failed_bookings?.length || 0} need retry/adjustment.`
        );
      } else if (response?.success) {
        setBookingMessage(`Trip booked successfully. Booking IDs: ${(response.booking_ids || []).join(", ")}`);
      } else {
        setFailedBookings(response?.failed_bookings || []);
        setBookingMessage("Booking failed.");
      }
    } catch (bookError) {
      setBookingMessage(bookError.message || "Unable to book trip.");
      setFailedBookings(bookError.failed_bookings || []);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleApplyDelay = async (delayMinutes) => {
    if (!plannedStops.length) return;
    const shifted = plannedStops.map((stop) => {
      const eta = new Date(stop.estimated_arrival_time);
      const target = new Date(stop.booking_target_time || stop.estimated_arrival_time);
      return {
        ...stop,
        estimated_arrival_time: new Date(eta.getTime() + delayMinutes * 60 * 1000).toISOString(),
        booking_target_time: new Date(target.getTime() + delayMinutes * 60 * 1000).toISOString(),
        slot_id: "",
      };
    });
    await refreshStopAvailability(shifted);
    setBookingMessage(`Applied ${delayMinutes} min delay and refreshed slots.`);
  };

  const handleRetryFailed = async () => {
    if (!failedBookings.length || !plannedStops.length) return;

    const retryPayload = [];
    failedBookings.forEach((failed) => {
      const stop = plannedStops.find((item) => item.station_id === failed.station_id);
      if (!stop) return;

      const preferredStation = failed.alternatives?.[0]?.station_id || stop.station_id;
      const fallbackStop = plannedStops.find((item) => item.station_id === preferredStation) || stop;
      const slot = fallbackStop.slot_id || fallbackStop.available_slots?.[0]?.id;
      if (!slot) return;
      const parsed = parseSlotTimes(slot, fallbackStop.estimated_arrival_time);
      const start = parsed?.startTime || new Date(fallbackStop.estimated_arrival_time);
      const end = parsed?.endTime || new Date(start.getTime() + 60 * 60 * 1000);
      retryPayload.push({
        station_id: preferredStation,
        slot_id: slot,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
    });

    if (!retryPayload.length) {
      setBookingMessage("No retry candidates available yet. Adjust station/slot manually.");
      return;
    }

    try {
      setBookingLoading(true);
      const response = await createBulkBooking({ bookings: retryPayload, allowPartial: true });
      if (response?.success) {
        setBookingMessage(
          `Retry booked ${response.booking_ids?.length || 0} stop(s).`
        );
        setFailedBookings(response.failed_bookings || []);
      }
    } catch (retryError) {
      setBookingMessage(retryError.message || "Retry failed.");
      setFailedBookings(retryError.failed_bookings || failedBookings);
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <Card>
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Route Planner</h3>
          <p className="text-sm text-slate-600">Find the best driving route with estimated distance and time.</p>
        </div>

        <form className="grid gap-4 md:grid-cols-4" onSubmit={handleRouteSearch}>
          <Input
            label="Start location"
            placeholder="e.g. Connaught Place, Delhi"
            value={startLocation}
            onChange={(event) => setStartLocation(event.target.value)}
          />
          <Input
            label="Destination"
            placeholder="e.g. Noida Sector 18"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          />
          <Input
            label="Radius (km)"
            type="number"
            min="1"
            max="50"
            value={radiusKm}
            onChange={(event) => setRadiusKm(Math.max(1, Number(event.target.value || 1)))}
          />
          <Button type="submit" className="md:self-end" disabled={loading}>
            {loading ? "Finding route..." : "Get Route"}
          </Button>
        </form>

        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label="Vehicle Range (km)"
            type="number"
            min="50"
            value={vehicleRangeKm}
            onChange={(event) => setVehicleRangeKm(Math.max(50, Number(event.target.value || 50)))}
          />
          <Input
            label="Current Battery (%)"
            type="number"
            min="1"
            max="100"
            value={batteryPercent}
            onChange={(event) => setBatteryPercent(Math.min(100, Math.max(1, Number(event.target.value || 1))))}
          />
          <Button variant="secondary" className="md:self-end" onClick={handleRecalculateStops} disabled={!routeCoordinates.length || loading}>
            Recalculate Stops
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Average Speed (km/h)"
            type="number"
            min="20"
            max="120"
            value={averageSpeedKmph}
            onChange={(event) => setAverageSpeedKmph(Math.min(120, Math.max(20, Number(event.target.value || 20))))}
          />
          <Input
            label="ETA Buffer (min)"
            type="number"
            min="15"
            max="30"
            value={bufferMinutes}
            onChange={(event) => setBufferMinutes(Math.min(30, Math.max(15, Number(event.target.value || 15))))}
          />
        </div>

        {error ? <p className="text-sm text-rose-500">{error}</p> : null}

        {routeCoordinates.length > 0 ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-[#e9f1ff] px-4 py-2 text-[#467ee5]">
              Total Distance: {formatDistance(routeDetails.distanceKm)}
            </span>
            <span className="rounded-full bg-[#eefaf3] px-4 py-2 text-emerald-700">
              Estimated Time: {formatDuration(routeDetails.durationMin)}
            </span>
            <span className="rounded-full bg-[#f8fafc] px-4 py-2 text-slate-600">
              Route Points Stored: {routeCoordinates.length}
            </span>
            <span className="rounded-full bg-[#fff8eb] px-4 py-2 text-amber-700">
              Stations Along Route: {nearbyStations.length}
            </span>
          </div>
        ) : null}

        {nearbyStations.length > 0 ? (
          <div className="rounded-2xl bg-[#f8fafc] p-4">
            <div className="text-sm font-semibold text-slate-800">
              Nearby Stations on Route ({nearbyStations.length})
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto pr-1">
              <div className="grid gap-2 md:grid-cols-2">
                {nearbyStations.map((station) => (
                <div key={station.station_id} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                  {station.name} - {formatDistance(station.distance_from_route)}
                </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {routeCoordinates.length > 0 ? (
          <div className="space-y-3 rounded-2xl bg-[#f8fafc] p-4">
            <div className="text-sm font-semibold text-slate-800">Suggested Charging Stops</div>
            {plannedStops.length > 0 ? (
              plannedStops.map((stop) => (
                <div key={stop.stop_order} className="grid gap-3 rounded-xl bg-white p-3 md:grid-cols-5">
                  <div className="text-sm text-slate-700">
                    <div className="font-semibold">Stop {stop.stop_order}</div>
                    <div>{stop.distance_from_start.toFixed(1)} km from start</div>
                    <div className="text-xs text-slate-500">ETA: {new Date(stop.estimated_arrival_time).toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Suggested booking: {new Date(stop.booking_target_time || stop.estimated_arrival_time).toLocaleTimeString()}</div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-600">Station</span>
                      <select
                        className="w-full rounded-xl border border-[#d7dfeb] bg-white px-3 py-2 text-sm text-slate-700"
                        value={stop.station_id}
                        onChange={(event) => handleStationChange(stop.stop_order, event.target.value)}
                      >
                        {nearbyStations.map((station) => (
                          <option key={station.station_id} value={station.station_id}>
                            {station.name} ({station.distance_from_route.toFixed(1)} km from route)
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-600">Available Slot</span>
                      <select
                        className="w-full rounded-xl border border-[#d7dfeb] bg-white px-3 py-2 text-sm text-slate-700"
                        value={stop.slot_id}
                        onChange={(event) => handleSlotChange(stop.stop_order, event.target.value)}
                      >
                        <option value="">Select slot</option>
                        {stop.available_slots.map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {slot.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-white p-3 text-sm text-slate-600">
                No charging stop is currently required for this route. You can still recalculate with lower battery/range values.
              </div>
            )}
            <Button onClick={handleBookEntireTrip} disabled={bookingLoading}>
              {bookingLoading ? "Booking..." : "Book Entire Trip"}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => handleApplyDelay(15)} disabled={!plannedStops.length || loading}>
                Delay +15m
              </Button>
              <Button variant="secondary" onClick={() => handleApplyDelay(30)} disabled={!plannedStops.length || loading}>
                Delay +30m
              </Button>
              <Button variant="secondary" onClick={handleRetryFailed} disabled={!failedBookings.length || bookingLoading}>
                Retry Failed
              </Button>
            </div>
            {bookingMessage ? <p className="text-sm text-slate-700">{bookingMessage}</p> : null}
            {failedBookings.length ? (
              <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                <div className="font-semibold">Failed Stops</div>
                {failedBookings.map((failed, index) => (
                  <div key={`${failed.station_id}-${index}`} className="mt-1">
                    Stop station {failed.station_id}: {failed.reason}
                    {failed.alternatives?.length ? (
                      <span> | Alternatives: {failed.alternatives.map((alt) => alt.name).join(", ")}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <RoutePlannerMap
          routeCoordinates={routeCoordinates}
          startPoint={startPoint}
          destinationPoint={destinationPoint}
          nearbyStations={nearbyStations}
          suggestedStops={plannedStops}
        />
      </div>
    </Card>
  );
}
