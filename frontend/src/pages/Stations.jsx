import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import StationsLeafletMap from "../components/maps/StationsLeafletMap";
import StationCard from "../components/StationCard";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Input from "../components/ui/Input";
import Loader from "../components/ui/Loader";
import Select from "../components/ui/Select";
import { getStationFilterOptions, getStations } from "../services/stationService";

export default function Stations({ user, onLogout }) {
  const [stations, setStations] = useState([]);
  const [filters, setFilters] = useState({ search: "", city: "All Cities", availability: "All Status" });
  const [options, setOptions] = useState({ cities: [], availability: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!options.cities.length || !options.availability.length) {
          const filterOptions = await getStationFilterOptions();
          if (!active) return;
          setOptions(filterOptions);
        }

        const stationResults = await getStations(filters);
        if (!active) return;
        setStations(stationResults);
        setError("");
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [filters, options.availability.length, options.cities.length]);

  const updateFilter = (field) => (event) => {
    setFilters((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <AppShell title="Charging Stations" user={user} onLogout={onLogout}>
      <div className="space-y-6">
        <Card>
          <div className="grid gap-4 md:grid-cols-3">
            <Input label="Search" placeholder="Search by station, city, or address" value={filters.search} onChange={updateFilter("search")} />
            <Select label="Location" value={filters.city} onChange={updateFilter("city")} options={options.cities} />
            <Select label="Availability" value={filters.availability} onChange={updateFilter("availability")} options={options.availability} />
          </div>
        </Card>

        {loading ? <Loader label="Fetching station network..." /> : null}
        {error ? <Card className="text-rose-500">{error}</Card> : null}

        {!loading && !error && stations.length === 0 ? (
          <EmptyState title="No stations matched your filters" description="Try widening your search or switching availability filters to discover more charging points." />
        ) : null}

        {!loading && stations.length > 0 ? (
          <div className="space-y-5">
            <Card className="p-0">
              <StationsLeafletMap stations={stations} heightClass="h-[380px]" />
            </Card>
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {stations.map((station) => (
                <StationCard key={station.id} station={station} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
