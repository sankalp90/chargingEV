import { apiConfig, buildAuthHeaders } from "./apiClient";
import { getStoredToken } from "./authService";

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
    const message =
      (typeof data?.detail === "string" && data.detail) ||
      (Array.isArray(data?.non_field_errors) && data.non_field_errors[0]) ||
      (data && typeof data === "object"
        ? Object.values(data).find((value) => Array.isArray(value) && value.length > 0)?.[0]
        : null) ||
      "Booking request failed.";

    const error = new Error(message);
    error.status = response.status;
    error.responseData = data;
    if (Array.isArray(data?.failed_bookings)) {
      error.failed_bookings = data.failed_bookings;
    }
    if (typeof data?.retryable === "boolean") {
      error.retryable = data.retryable;
    }
    throw error;
  }

  return data;
};

const normalizeBooking = (booking) => ({
  ...booking,
  chargerType: booking.chargerType ?? booking.charger_type ?? "",
  energyNeeded: Number(booking.energyNeeded ?? booking.energy_needed ?? 0),
  vehicleNumber: booking.vehicleNumber ?? booking.vehicle_number ?? "",
  amount: Number(booking.amount ?? 0),
});

const toNumericStationId = (stationId) => {
  const normalizeSafeInt = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return NaN;
    // Keep IDs within a conservative 32-bit positive range for backend PK compatibility.
    const safeRange = 2_000_000_000;
    const normalized = Math.abs(Math.trunc(numeric)) % safeRange;
    return normalized || 1;
  };

  if (typeof stationId === "number") return normalizeSafeInt(stationId);
  if (typeof stationId === "string" && stationId.startsWith("ocm-")) {
    return normalizeSafeInt(stationId.replace("ocm-", ""));
  }
  return normalizeSafeInt(stationId);
};

const importStation = async (stationSnapshot, stationId) => {
  const numericStationId = toNumericStationId(stationId);
  if (!stationSnapshot) return numericStationId;

  const imported = await request("/stations/import/", {
    method: "POST",
    body: JSON.stringify({
      id: numericStationId,
      name: stationSnapshot.name,
      city: stationSnapshot.city || "Unknown",
      latitude: stationSnapshot.lat ?? stationSnapshot.latitude,
      longitude: stationSnapshot.lng ?? stationSnapshot.longitude,
      total_slots: stationSnapshot.totalSlots || stationSnapshot.connectors || 6,
      available_slots: stationSnapshot.availableSlots || stationSnapshot.available_slots || 3,
      charger_types: stationSnapshot.chargerTypes || ["CCS2"],
      price_per_unit: stationSnapshot.pricePerKwh || stationSnapshot.price_per_unit || 20,
    }),
  });

  return imported.id;
};

export const ensureBackendStationId = async (stationId, stationSnapshot) =>
  importStation(stationSnapshot, stationId);

export const getBookings = async () => {
  const data = await request("/bookings/");
  return data.map(normalizeBooking);
};

export const getAvailableSlots = async (stationId, stationSnapshot) => {
  const backendStationId = await importStation(stationSnapshot, stationId);
  return request(`/stations/${backendStationId}/available-slots/`);
};

export const createBooking = async (payload) => {
  const backendStationId = await importStation(payload.stationSnapshot, payload.stationId);
  const data = await request("/bookings/", {
    method: "POST",
    body: JSON.stringify({
      station: backendStationId,
      date: payload.date,
      slot: payload.slot,
      charger_type: payload.chargerType,
      energy_needed: Number(payload.energyNeeded),
      vehicle_number: payload.vehicleNumber,
      notes: payload.notes || "",
    }),
  });
  return normalizeBooking(data);
};

export const createBulkBooking = async ({ bookings = [], allowPartial = false } = {}) => {
  if (!Array.isArray(bookings) || !bookings.length) {
    throw new Error("No bookings provided.");
  }
  return request("/bookings/bulk/", {
    method: "POST",
    body: JSON.stringify({ bookings, allow_partial: allowPartial }),
  });
};
