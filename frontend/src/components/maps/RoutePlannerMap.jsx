import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function FitRouteBounds({ routeCoordinates = [], startPoint, destinationPoint, nearbyStations = [] }) {
  const map = useMap();

  useEffect(() => {
    const points = [];

    if (startPoint) {
      points.push([startPoint.lat, startPoint.lng]);
    }

    if (destinationPoint) {
      points.push([destinationPoint.lat, destinationPoint.lng]);
    }

    nearbyStations.forEach((station) => {
      const lat = Number(station.location?.lat);
      const lng = Number(station.location?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push([lat, lng]);
      }
    });

    if (routeCoordinates.length) {
      routeCoordinates.forEach(([lat, lng]) => points.push([lat, lng]));
    }

    if (!points.length) return;

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.2), { animate: true });
  }, [map, routeCoordinates, startPoint, destinationPoint, nearbyStations]);

  return null;
}

export default function RoutePlannerMap({
  routeCoordinates = [],
  startPoint = null,
  destinationPoint = null,
  nearbyStations = [],
  suggestedStops = [],
  heightClass = "h-[360px]",
}) {
  const center = startPoint
    ? [startPoint.lat, startPoint.lng]
    : destinationPoint
      ? [destinationPoint.lat, destinationPoint.lng]
      : [28.6139, 77.209];

  return (
    <div className={`overflow-hidden rounded-3xl ${heightClass}`}>
      <MapContainer center={center} zoom={11} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitRouteBounds
          routeCoordinates={routeCoordinates}
          startPoint={startPoint}
          destinationPoint={destinationPoint}
          nearbyStations={nearbyStations}
        />

        {startPoint ? <Marker position={[startPoint.lat, startPoint.lng]} /> : null}
        {destinationPoint ? <Marker position={[destinationPoint.lat, destinationPoint.lng]} /> : null}

        {routeCoordinates.length > 0 ? (
          <Polyline positions={routeCoordinates} pathOptions={{ color: "#467ee5", weight: 5 }} />
        ) : null}

        {nearbyStations.map((station) => (
          <Marker
            key={station.station_id}
            position={[station.location.lat, station.location.lng]}
          >
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold text-slate-900">{station.name}</div>
                <div className="text-xs text-slate-600">
                  {station.distance_from_route.toFixed(2)} km from route
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {suggestedStops.map((stop) => (
          <Marker
            key={`stop-${stop.stop_order}-${stop.station_id}`}
            position={[stop.location.lat, stop.location.lng]}
          >
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold text-slate-900">Stop {stop.stop_order}: {stop.name}</div>
                <div className="text-xs text-slate-600">
                  Around {stop.distance_from_start.toFixed(1)} km from start
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
