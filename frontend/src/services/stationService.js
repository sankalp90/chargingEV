import { apiConfig, buildAuthHeaders } from "./apiClient";
import { getStoredToken, getValidToken, refreshAccessToken } from "./authService";
import { getOpenChargeStationById, getOpenChargeStations } from "./openChargeService";
import { getDistanceKm, getRecommendationReason, getStationFitScore } from "../utils/geo";

export const defaultUserLocation = {
  lat: 28.6139,
  lng: 77.209,
  label: "New Delhi (fallback)",
};

export const defaultDestination = {
  lat: 28.5355,
  lng: 77.391,
  label: "Noida (default destination)",
};

const request = async (path, options = {}) => {
  let token = await getValidToken();
  if (!token) token = getStoredToken();
  let response = await fetch(`${apiConfig.baseUrl}${path}`, {
    ...options,
    headers: {
      ...buildAuthHeaders(token),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed?.token) {
      response = await fetch(`${apiConfig.baseUrl}${path}`, {
        ...options,
        headers: {
          ...buildAuthHeaders(refreshed.token),
          ...(options.headers || {}),
        },
      });
    }
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (typeof data?.detail === "string") {
      throw new Error(data.detail);
    }
    throw new Error("Unable to fetch stations data.");
  }

  return data;
};

const getAvailability = (station) => {
  if (station.available_slots > 2) return "Available";
  if (station.available_slots > 0) return "Low Availability";
  return "Busy";
};

const normalizeBackendStation = (station) => {
  const pricePerKwh = Number(station.price_per_unit ?? station.pricePerKwh ?? 0);
  const chargerTypes = station.charger_types ?? station.chargerTypes ?? [];
  const totalSlots = Number(station.total_slots ?? 0);
  const availableSlots = Number(station.available_slots ?? 0);

  return {
    ...station,
    id: String(station.id),
    lat: Number(station.lat ?? station.latitude ?? 0),
    lng: Number(station.lng ?? station.longitude ?? 0),
    pricePerKwh,
    chargerTypes,
    connectors: totalSlots,
    availability: getAvailability(station),
    location: station.address || `${station.city}`,
    address: station.address || `${station.city}`,
    openHours: station.openHours || "24x7",
    powerOutput: station.powerOutput || (chargerTypes.includes("CCS2") ? "120 kW" : "60 kW"),
    amenities: station.amenities || ["Restroom", "Cafe", "Parking"],
    rating: Number(station.rating || 4.4),
    image: station.image || `https://picsum.photos/seed/station-${station.id}/960/540`,
    recommended: availableSlots > 0,
    totalSlots,
    availableSlots,
  };
};

const getBackendStations = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.city && filters.city !== "All Cities") params.set("city", filters.city);
  if (filters.availability && filters.availability !== "All Status") params.set("availability", filters.availability);
  const query = params.toString();
  const data = await request(`/stations/${query ? `?${query}` : ""}`);
  return data.map(normalizeBackendStation);
};

const applyLocalFilters = (stations, filters = {}) => {
  const searchTerm = (filters.search || "").trim().toLowerCase();
  return stations.filter((station) => {
    const matchesSearch =
      !searchTerm ||
      [station.name, station.location, station.address, station.city]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchTerm);
    const matchesCity = !filters.city || filters.city === "All Cities" || station.city === filters.city;
    const matchesAvailability =
      !filters.availability || filters.availability === "All Status" || station.availability === filters.availability;
    return matchesSearch && matchesCity && matchesAvailability;
  });
};

const mergeAndDedupeStations = (primary = [], secondary = []) => {
  const merged = [];
  const thresholdKm = 0.1; // 100 meters

  const upsert = (station) => {
    if (!station || !Number.isFinite(station.lat) || !Number.isFinite(station.lng)) return;

    const idx = merged.findIndex((existing) => getDistanceKm(existing, station) < thresholdKm);
    if (idx === -1) {
      merged.push(station);
      return;
    }

    const existing = merged[idx];
    const stationSource = String(station.source || "").toUpperCase();
    const existingSource = String(existing.source || "").toUpperCase();

    // Prefer NITI record when duplicates are very close.
    if (stationSource === "NITI" && existingSource !== "NITI") {
      merged[idx] = station;
      return;
    }
    if (existingSource === "NITI" && stationSource !== "NITI") {
      return;
    }

    // Otherwise keep the first one (stable ordering).
  };

  primary.forEach(upsert);
  secondary.forEach(upsert);
  return merged;
};

const getMergedStations = async (filters = {}) => {
  const [ocmResult, backendResult] = await Promise.allSettled([
    getOpenChargeStations(),
    getBackendStations(filters),
  ]);

  const ocmStations = ocmResult.status === "fulfilled" ? ocmResult.value : [];
  const backendStations = backendResult.status === "fulfilled" ? backendResult.value : [];

  // Prefer backend stations for India when duplicates are found (NITI priority is handled in merge).
  return mergeAndDedupeStations(backendStations, ocmStations);
};

export const getDashboardData = async () => {
  const [data, stations] = await Promise.all([request("/dashboard/"), getMergedStations()]);

  const recommendations = stations.length ? stations.slice(0, 3) : (data.recommendations || []).map(normalizeBackendStation);

  return {
    ...data,
    recommendations,
    stats: [
      { ...(data.stats?.[0] || {}), value: stations.length || data.stats?.[0]?.value || 0 },
      ...(data.stats || []).slice(1),
    ],
  };
};

export const getStations = async (filters = {}) => {
  const stations = await getMergedStations(filters);
  return applyLocalFilters(stations, filters);
};

export const getStationById = async (stationId) => {
  if (String(stationId).startsWith("ocm-")) {
    const station = await getOpenChargeStationById(stationId);
    if (!station) {
      throw new Error("Station not found.");
    }
    return station;
  }

  try {
    const station = await getOpenChargeStationById(stationId);
    if (station) return station;
  } catch {
    // ignore and fall back to backend
  }

  const data = await request(`/stations/${stationId}/`);
  return normalizeBackendStation(data);
};

export const getStationFilterOptions = async () => {
  const stationData = await getStations();
  const citySet = new Set(stationData.map((station) => station.city).filter(Boolean));
  return {
    cities: ["All Cities", ...Array.from(citySet)],
    availability: ["All Status", "Available", "Busy"],
  };
};

export const getStationsAlongRoute = async ({ routeCoordinates = [], radiusKm = 5 } = {}) => {
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return [];
  }

  const data = await request("/stations/along-route/", {
    method: "POST",
    body: JSON.stringify({
      route_coordinates: routeCoordinates,
      radius: radiusKm,
    }),
  });

  if (!Array.isArray(data)) return [];

  return data.map((station) => ({
    station_id: station.station_id,
    name: station.name || "Unknown Station",
    location: {
      lat: Number(station.location?.lat ?? 0),
      lng: Number(station.location?.lng ?? 0),
    },
    distance_from_route: Number(station.distance_from_route ?? 0),
  }))
    .filter((station) => Number.isFinite(station.location.lat) && Number.isFinite(station.location.lng));
};

export const getBulkStationAvailability = async ({
  stationIds = [],
  estimatedArrivalTimes = [],
  windowMinutes = 60,
} = {}) => {
  if (!stationIds.length) return [];

  const data = await request("/stations/bulk-availability/", {
    method: "POST",
    body: JSON.stringify({
      station_ids: stationIds,
      estimated_arrival_times: estimatedArrivalTimes,
      window_minutes: windowMinutes,
    }),
  });

  if (!Array.isArray(data)) return [];
  return data;
};

export const getSmartRecommendations = async (origin = defaultUserLocation, energyNeeded = 24) => {
  const batteryCapacity = 50;
  const efficiency = 0.15;
  const estimatedBatteryPercentage = Math.max(15, Math.min(95, Math.round((energyNeeded / batteryCapacity) * 100) + 35));
  const response = await request("/recommend-charging/", {
    method: "POST",
    body: JSON.stringify({
      current_location: { lat: Number(origin.lat), lng: Number(origin.lng) },
      destination: { lat: defaultDestination.lat, lng: defaultDestination.lng },
      battery_percentage: estimatedBatteryPercentage,
      battery_capacity: batteryCapacity,
      efficiency,
    }),
  });

  const stations = Array.isArray(response?.recommended_stations) ? response.recommended_stations : [];
  const sourceLabel = Array.isArray(response?.data_sources?.stations)
    ? response.data_sources.stations.join("/")
    : "backend";

  return stations.map((station) => {
    const distanceKm = Number(station.distance ?? 0);
    const pricePerKwh = Number(station.cost ?? 20) || 20;
    const travelMinutes = Math.max(3, Math.round((Number(station.detour_time ?? 0) + distanceKm / 0.55)));
    const mapped = {
      id: String(station.id),
      name: station.name || "Recommended Station",
      city: "Route suggestion",
      lat: Number(station.latitude ?? origin.lat),
      lng: Number(station.longitude ?? origin.lng),
      distanceKm: Number(distanceKm.toFixed(1)),
      travelMinutes,
      chargingCost: Math.round(pricePerKwh * Number(energyNeeded || 0)),
      score: Math.round(Number(station.score || 0) * 100),
      rating: Number((3.8 + Number(station.score || 0) * 1.2).toFixed(1)),
      pricePerKwh,
      powerOutput: `${Math.round(Number(station.charging_speed || 30))} kW`,
      availability: station.availability === "available" ? "Available" : "Busy",
      chargerTypes: ["CCS2"],
      location: `Detour ${Number(station.detour_time ?? 0).toFixed(1)} min`,
      address: `Recommendation source: ${sourceLabel}`,
      image: `https://picsum.photos/seed/reco-${station.id}/960/540`,
      source: sourceLabel,
      recommended: true,
      waitTime: Number(station.wait_time ?? 0),
      matchReason: `Detour ${Number(station.detour_time ?? 0).toFixed(1)} min, wait ${Number(station.wait_time ?? 0).toFixed(1)} min, battery after reach ${Number(station.battery_after_reach_pct ?? 0).toFixed(1)}%.`,
    };
    const route = getStationFitScore(mapped, origin, energyNeeded);
    return {
      ...mapped,
      ...route,
      matchReason: getRecommendationReason(mapped, route),
    };
  });
};

export const getBestStationForRoute = async ({ origin = defaultUserLocation, energyNeeded = 24 } = {}) => {
  const [best] = await getSmartRecommendations(origin, energyNeeded);
  return best ?? null;
};
