const OPEN_CHARGE_BASE_URL = "https://api.openchargemap.io/v3/poi/";
const DEFAULT_COUNTRY_CODE = "IN";
const DEFAULT_MAX_RESULTS = 200;

let stationCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const parsePrice = (usageCost) => {
  if (!usageCost) return 20;
  const match = String(usageCost).match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : 20;
};

const normalizeStation = (poi) => {
  const address = poi.AddressInfo || {};
  const connections = Array.isArray(poi.Connections) ? poi.Connections : [];
  const chargerTypes = Array.from(
    new Set(
      connections
        .map((connection) => connection?.ConnectionType?.Title)
        .filter(Boolean)
    )
  );
  const powerValues = connections
    .map((connection) => Number(connection?.PowerKW || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxPower = powerValues.length ? Math.max(...powerValues) : 60;
  const pricePerKwh = parsePrice(poi.UsageCost);
  const totalSlots = Number(poi.NumberOfPoints || connections.length || 4);
  const isOperational = poi.StatusType?.IsOperational !== false;
  const availableSlots = isOperational ? Math.max(1, totalSlots - 1) : 0;
  const city = address.Town || address.StateOrProvince || "Unknown";

  return {
    id: `ocm-${poi.ID}`,
    openChargeId: Number(poi.ID),
    name: address.Title || "Unnamed Charging Station",
    city,
    location: [address.AddressLine1, city].filter(Boolean).join(", ") || city,
    address: [address.AddressLine1, address.AddressLine2, city].filter(Boolean).join(", ") || city,
    lat: Number(address.Latitude || 0),
    lng: Number(address.Longitude || 0),
    latitude: Number(address.Latitude || 0),
    longitude: Number(address.Longitude || 0),
    chargerTypes: chargerTypes.length ? chargerTypes : ["CCS2"],
    pricePerKwh,
    rating: Number(poi.UserComments?.[0]?.Rating || 4.2),
    availability: isOperational ? (availableSlots > 2 ? "Available" : "Low Availability") : "Busy",
    available_slots: availableSlots,
    total_slots: totalSlots,
    availableSlots,
    totalSlots,
    connectors: totalSlots,
    powerOutput: `${Math.round(maxPower)} kW`,
    openHours: "24x7",
    amenities: ["Parking", "Restroom"],
    image: `https://picsum.photos/seed/opencharge-${poi.ID}/960/540`,
    source: "opencharge",
  };
};

const fetchOpenChargeStations = async ({ lat, lng, maxResults = DEFAULT_MAX_RESULTS } = {}) => {
  const params = new URLSearchParams({
    output: "json",
    countrycode: DEFAULT_COUNTRY_CODE,
    maxresults: String(maxResults),
    compact: "true",
    verbose: "false",
  });

  if (typeof lat === "number" && typeof lng === "number") {
    params.set("latitude", String(lat));
    params.set("longitude", String(lng));
    params.set("distance", "200");
    params.set("distanceunit", "KM");
  }

  const apiKey = import.meta.env.VITE_OPENCHARGE_API_KEY;
  if (apiKey) {
    params.set("key", apiKey);
  }

  const response = await fetch(`${OPEN_CHARGE_BASE_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error("OpenChargeMap request failed.");
  }

  const data = await response.json();
  if (!Array.isArray(data)) return [];

  return data
    .map(normalizeStation)
    .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng));
};

export const getOpenChargeStations = async (options = {}) => {
  const now = Date.now();
  if (stationCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return stationCache;
  }
  const stations = await fetchOpenChargeStations(options);
  stationCache = stations;
  cacheTimestamp = now;
  return stations;
};

export const getOpenChargeStationById = async (stationId) => {
  const stations = await getOpenChargeStations();
  return stations.find((station) => station.id === stationId || String(station.openChargeId) === String(stationId)) || null;
};

export const clearOpenChargeCache = () => {
  stationCache = null;
  cacheTimestamp = 0;
};
