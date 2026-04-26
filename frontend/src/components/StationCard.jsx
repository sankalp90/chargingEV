import { Link } from "react-router-dom";
import Badge from "./ui/Badge";
import Card from "./ui/Card";
import Button from "./ui/Button";
import { getAvailabilityTone } from "../utils/formatters";

export default function StationCard({ station }) {
  return (
    <Card className="overflow-hidden p-0">
      <img src={station.image} alt={station.name} className="h-44 w-full object-cover" />
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{station.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{station.location}</p>
          </div>
          <Badge className={getAvailabilityTone(station.availability)}>{station.availability}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {station.chargerTypes.map((type) => (
            <Badge key={type}>{type}</Badge>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm text-slate-600">
          <div>
            <div className="text-slate-400">Distance</div>
            <div>{station.distanceKm} km</div>
          </div>
          <div>
            <div className="text-slate-400">Power</div>
            <div>{station.powerOutput}</div>
          </div>
          <div>
            <div className="text-slate-400">Price</div>
            <div>₹{station.pricePerKwh}/kWh</div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button as={Link} to={`/stations/${station.id}`} variant="secondary" className="flex-1">
            View Details
          </Button>
          <Button as={Link} to={`/booking?stationId=${station.id}`} className="flex-1">
            Book Slot
          </Button>
        </div>
      </div>
    </Card>
  );
}
