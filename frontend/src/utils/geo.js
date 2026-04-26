const toRadians = (value) => (value * Math.PI) / 180;

export const getDistanceKm = (origin, destination) => {
  if (!origin || !destination) return 0;
  const earthRadiusKm = 6371;
  const latDiff = toRadians(destination.lat - origin.lat);
  const lngDiff = toRadians(destination.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);

  const haversine =
    Math.sin(latDiff / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDiff / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const getTravelMinutes = (distanceKm, averageSpeedKmph = 32) =>
  Math.max(4, Math.round((distanceKm / averageSpeedKmph) * 60));

export const getRouteSummary = (origin, station, energyNeeded = 0) => {
  const distanceKm = Number(getDistanceKm(origin, station).toFixed(1));
  const travelMinutes = getTravelMinutes(distanceKm);
  const chargingCost = Math.round((energyNeeded || 0) * station.pricePerKwh);

  return {
    distanceKm,
    travelMinutes,
    chargingCost,
  };
};

export const getStationFitScore = (station, origin, energyNeeded = 0) => {
  const { distanceKm, travelMinutes, chargingCost } = getRouteSummary(origin, station, energyNeeded);
  const availabilityBoost =
    station.availability === "Available" ? 20 : station.availability === "Low Availability" ? 8 : 2;

  return {
    distanceKm,
    travelMinutes,
    chargingCost,
    score:
      station.rating * 14 +
      availabilityBoost +
      Number.parseFloat(station.powerOutput) / 8 -
      distanceKm * 1.6 -
      chargingCost / 22,
  };
};

export const getRecommendationReason = (station, route) => {
  if (station.availability === "Available" && route.distanceKm < 8) {
    return "Closest ready-to-charge option from your current location.";
  }
  if (route.chargingCost <= 300) {
    return "Lower charging spend for the energy you selected.";
  }
  if (Number.parseFloat(station.powerOutput) >= 150) {
    return "Faster top-up time thanks to its high-power chargers.";
  }
  return `Balanced route pick for ${station.city} with solid availability and travel time.`;
};
