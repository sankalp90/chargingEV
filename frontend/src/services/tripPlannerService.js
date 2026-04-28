import { getDistanceKm } from "../utils/geo";

const DEFAULT_RESERVE_RATIO = 0.1;
const EARLY_STOP_RATIO = 0.55;
const PREFERRED_STOP_RATIO = 0.85;
const EPSILON = 1e-6;

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toRoutePoint = (point) => {
  if (Array.isArray(point) && point.length >= 2) {
    const lat = toNumber(point[0], NaN);
    const lng = toNumber(point[1], NaN);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  if (point && typeof point === "object") {
    const lat = toNumber(point.lat ?? point.latitude, NaN);
    const lng = toNumber(point.lng ?? point.longitude, NaN);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  return null;
};

const buildRouteSegments = (routeCoordinates = []) => {
  const points = routeCoordinates.map(toRoutePoint).filter(Boolean);
  if (points.length < 2) return { points: [], segments: [], totalDistanceKm: 0 };

  const segments = [];
  let cumulativeKm = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentDistanceKm = getDistanceKm(start, end);
    segments.push({
      start,
      end,
      startDistanceKm: cumulativeKm,
      lengthKm: segmentDistanceKm,
    });
    cumulativeKm += segmentDistanceKm;
  }

  return { points, segments, totalDistanceKm: cumulativeKm };
};

const projectStationDistanceOnRoute = (stationPoint, segments) => {
  if (!stationPoint || !segments.length) return null;

  let best = null;

  segments.forEach((segment) => {
    const latRef = ((segment.start.lat + segment.end.lat + stationPoint.lat) / 3) * (Math.PI / 180);
    const kmPerDegLat = 111.32;
    const kmPerDegLng = 111.32 * Math.cos(latRef);

    const px = stationPoint.lng * kmPerDegLng;
    const py = stationPoint.lat * kmPerDegLat;
    const x1 = segment.start.lng * kmPerDegLng;
    const y1 = segment.start.lat * kmPerDegLat;
    const x2 = segment.end.lng * kmPerDegLng;
    const y2 = segment.end.lat * kmPerDegLat;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const denominator = dx * dx + dy * dy;
    const rawT = denominator > 0 ? ((px - x1) * dx + (py - y1) * dy) / denominator : 0;
    const t = Math.max(0, Math.min(1, rawT));

    const nearestPoint = {
      lat: segment.start.lat + (segment.end.lat - segment.start.lat) * t,
      lng: segment.start.lng + (segment.end.lng - segment.start.lng) * t,
    };
    const perpendicularDistanceKm = getDistanceKm(stationPoint, nearestPoint);
    const distanceFromStartKm = segment.startDistanceKm + segment.lengthKm * t;

    if (!best || perpendicularDistanceKm < best.perpendicularDistanceKm) {
      best = {
        distanceFromStartKm,
        perpendicularDistanceKm,
      };
    }
  });

  return best;
};

const dedupeStations = (stations = []) => {
  const map = new Map();
  stations.forEach((station) => {
    const stationId = station.station_id ?? station.id;
    if (!stationId) return;

    const existing = map.get(stationId);
    if (!existing) {
      map.set(stationId, station);
      return;
    }

    const existingScore = toNumber(existing.rating, 0) - toNumber(existing.distance_from_route, 0);
    const currentScore = toNumber(station.rating, 0) - toNumber(station.distance_from_route, 0);
    if (currentScore > existingScore) {
      map.set(stationId, station);
    }
  });
  return Array.from(map.values());
};

const normalizeAlongRouteStations = (stations = [], routeSegments = []) =>
  dedupeStations(stations)
    .map((station) => {
      const lat = toNumber(station.location?.lat ?? station.lat ?? station.latitude, NaN);
      const lng = toNumber(station.location?.lng ?? station.lng ?? station.longitude, NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const projection = projectStationDistanceOnRoute({ lat, lng }, routeSegments);
      if (!projection) return null;

      return {
        ...station,
        station_id: station.station_id ?? station.id,
        rating: toNumber(station.rating, 0),
        distance_from_route: toNumber(
          station.distance_from_route,
          projection.perpendicularDistanceKm
        ),
        distance_from_start: projection.distanceFromStartKm,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.distance_from_start - right.distance_from_start);

const chooseBestCandidate = (candidates, targetDistanceKm) => {
  if (!candidates.length) return null;

  const sorted = [...candidates].sort((left, right) => {
    const leftScore =
      left.rating * 20 - Math.abs(left.distance_from_start - targetDistanceKm) * 1.8 - left.distance_from_route * 2.2;
    const rightScore =
      right.rating * 20 - Math.abs(right.distance_from_start - targetDistanceKm) * 1.8 - right.distance_from_route * 2.2;
    return rightScore - leftScore;
  });

  return sorted[0];
};

export const planTripStops = ({
  vehicleRangeKm,
  currentBatteryPercent,
  routeDistanceKm,
  routeCoordinates = [],
  stationsAlongRoute = [],
  reserveRatio = DEFAULT_RESERVE_RATIO,
} = {}) => {
  const fullRangeKm = toNumber(vehicleRangeKm, 0);
  const batteryPercent = toNumber(currentBatteryPercent, 0);

  if (fullRangeKm <= 0) {
    throw new Error("vehicleRangeKm must be greater than 0.");
  }
  if (batteryPercent <= 0 || batteryPercent > 100) {
    throw new Error("currentBatteryPercent must be within 1-100.");
  }

  const route = buildRouteSegments(routeCoordinates);
  const computedRouteDistanceKm = route.totalDistanceKm;
  const totalDistanceKm = Math.max(
    toNumber(routeDistanceKm, 0),
    computedRouteDistanceKm
  );

  if (totalDistanceKm <= 0) {
    throw new Error("A valid route is required to plan charging stops.");
  }

  const stations = normalizeAlongRouteStations(stationsAlongRoute, route.segments);
  const usableFullRangeKm = fullRangeKm * (1 - Math.min(Math.max(reserveRatio, 0), 0.4));
  const initialHardRangeKm = (fullRangeKm * batteryPercent) / 100;
  const initialUsableRangeKm = initialHardRangeKm * (1 - Math.min(Math.max(reserveRatio, 0), 0.4));

  if (initialHardRangeKm + EPSILON >= totalDistanceKm) {
    return [];
  }

  const plannedStops = [];
  let currentDistanceKm = 0;
  let currentUsableRangeKm = initialUsableRangeKm;
  let currentHardRangeKm = initialHardRangeKm;

  while (currentDistanceKm + currentHardRangeKm + EPSILON < totalDistanceKm) {
    const hardLimit = currentDistanceKm + currentHardRangeKm;
    const preferredTarget = currentDistanceKm + currentUsableRangeKm * PREFERRED_STOP_RATIO;
    const minConsidered = currentDistanceKm + currentUsableRangeKm * EARLY_STOP_RATIO;

    const feasibleStations = stations.filter(
      (station) =>
        station.distance_from_start > currentDistanceKm + EPSILON &&
        station.distance_from_start <= hardLimit + EPSILON
    );

    const preferredStations = feasibleStations.filter(
      (station) => station.distance_from_start >= minConsidered
    );

    const selected =
      chooseBestCandidate(preferredStations, preferredTarget) ||
      chooseBestCandidate(feasibleStations, preferredTarget);

    if (!selected) {
      throw new Error("Trip is not feasible: no charging station found before battery would run out.");
    }

    plannedStops.push({
      station_id: selected.station_id,
      stop_order: plannedStops.length + 1,
      distance_from_start: Number(selected.distance_from_start.toFixed(2)),
    });

    currentDistanceKm = selected.distance_from_start;
    currentUsableRangeKm = usableFullRangeKm;
    currentHardRangeKm = fullRangeKm;
  }

  const routeBreakpoints = [0, ...plannedStops.map((stop) => stop.distance_from_start), totalDistanceKm];
  for (let index = 0; index < routeBreakpoints.length - 1; index += 1) {
    const gap = routeBreakpoints[index + 1] - routeBreakpoints[index];
    if (gap > fullRangeKm + EPSILON) {
      throw new Error("Trip plan invalid: one or more route gaps exceed vehicle range.");
    }
  }

  return plannedStops;
};
