import { apiConfig, buildAuthHeaders } from "./apiClient";
import { getStoredToken } from "./authService";
import { getOpenChargeStationById, getOpenChargeStations } from "./openChargeService";
import { getDistanceKm, getRecommendationReason, getStationFitScore } from "../utils/geo";

export const defaultUserLocation = {
  lat: 28.6139,
  lng: 77.209,
  label: "New Delhi (fallback)",
};

const request = async (path, options = {}) => {
  const token = getStoredToken();
  const response = await fetch(`${apiConfig.baseUrl}${path}`, {
    ...options,
    headers: {
      ...buildAuthHeaders(token),
      ...(options.headers || {}),
    },
  });

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

export const getSmartRecommendations = async (origin = defaultUserLocation, energyNeeded = 24) => {
  const data = await getMergedStations();

  return data
    .map((station) => {
      const route = getStationFitScore(station, origin, energyNeeded);
      return {
        ...station,
        ...route,
        matchReason: getRecommendationReason(station, route),
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
};

export const getBestStationForRoute = async ({ origin = defaultUserLocation, energyNeeded = 24 } = {}) => {
  const [best] = await getSmartRecommendations(origin, energyNeeded);
  return best ?? null;
};
