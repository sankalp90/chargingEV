import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function FitBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
    map.fitBounds(bounds.pad(0.2), { animate: true });
  }, [map, points]);

  return null;
}

export default function StationsLeafletMap({ stations = [], heightClass = "h-[340px]" }) {
  const points = stations.filter(
    (station) => Number.isFinite(station.lat) && Number.isFinite(station.lng)
  );
  const center = points[0] ? [points[0].lat, points[0].lng] : [28.6139, 77.209];

  return (
    <div className={`overflow-hidden rounded-3xl ${heightClass}`}>
      <MapContainer center={center} zoom={11} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {points.map((station) => (
          <Marker key={station.id} position={[station.lat, station.lng]}>
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold text-slate-900">{station.name}</div>
                <div className="text-xs text-slate-600">{station.address || station.location}</div>
                <div className="text-xs text-slate-600">
                  {station.city} • {station.availability}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
