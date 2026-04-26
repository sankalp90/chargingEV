import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import StationCard from "../components/StationCard";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Loader from "../components/ui/Loader";
import { getDashboardData } from "../services/stationService";

export default function Dashboard({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboardData()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <AppShell title="Dashboard" user={user} onLogout={onLogout}>
      {!data && !error ? <Loader label="Loading dashboard..." /> : null}
      {error ? <Card className="text-rose-500">{error}</Card> : null}

      {data ? (
        <div className="space-y-10">
          <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-8 rounded-[40px] bg-white px-8 py-10 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.32em] text-slate-400">
                {data.cityBands.map((city) => (
                  <span key={city}>{city}</span>
                ))}
              </div>

              <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <h2 className="max-w-3xl text-4xl font-semibold leading-[1.15] text-slate-900">
                    Route-first charging for Madhya Pradesh, built around where you are heading next.
                  </h2>
                  <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-500">
                    Fewer distractions, smarter station choice, and booking decisions shaped by proximity, charging speed, and spend.
                  </p>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button as={Link} to="/booking" className="rounded-full px-6">
                      Start Smart Booking
                    </Button>
                    <Button as={Link} to="/stations" variant="secondary" className="rounded-full px-6">
                      Browse MP Stations
                    </Button>
                  </div>
                </div>

                <div className="space-y-4 rounded-[32px] bg-[#edf4ff] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Live snapshot</p>
                  {data.stats.map((stat) => (
                    <div key={stat.label} className="flex items-center justify-between gap-4 border-b border-white/70 pb-4 last:border-b-0 last:pb-0">
                      <div>
                        <div className="text-sm text-slate-500">{stat.label}</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-900">{stat.value}</div>
                      </div>
                      <div className="max-w-[140px] text-right text-xs uppercase tracking-[0.18em] text-[#467ee5]">
                        {stat.change}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[32px] bg-[#d9edff] px-6 py-8">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Charging pulse</p>
                <h3 className="mt-4 text-3xl font-semibold leading-tight text-slate-900">Best station suggestions now respond to route cost, not just distance.</h3>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  Booking intelligence now considers ETA, charging spend, and charger readiness together.
                </p>
              </div>

              <Card className="rounded-[32px]">
                <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Recent activity</p>
                <div className="mt-5 space-y-5">
                  {data.recentActivity.map((item) => (
                    <div key={item.id} className="grid grid-cols-[10px_1fr] gap-4">
                      <div className="mt-2 h-2.5 w-2.5 rounded-full bg-[#467ee5]" />
                      <div>
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="font-medium text-slate-800">{item.title}</h4>
                          <span className="text-xs text-slate-400">{item.time}</span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Curated route picks</p>
                <h2 className="mt-2 text-3xl font-semibold text-slate-900">Suggested stations that feel worth the stop.</h2>
              </div>
              <Button as={Link} to="/recommendations" variant="secondary" className="rounded-full px-6">
                View full ranking
              </Button>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              {data.recommendations.map((station) => (
                <StationCard key={station.id} station={station} />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
