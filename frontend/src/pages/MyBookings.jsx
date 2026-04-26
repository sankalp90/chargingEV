import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Loader from "../components/ui/Loader";
import { getBookings } from "../services/bookingService";
import { formatCurrency, formatReadableDate } from "../utils/formatters";

export default function MyBookings({ user, onLogout }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getBookings()
      .then(setBookings)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell title="My Bookings" user={user} onLogout={onLogout}>
      {loading ? <Loader label="Loading your bookings..." /> : null}
      {error ? <Card className="text-rose-500">{error}</Card> : null}

      {!loading && !error && bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          description="Your upcoming and past charging sessions will appear here once you reserve a slot."
          action={
            <Button as={Link} to="/booking">
              Create Booking
            </Button>
          }
        />
      ) : null}

      {!loading && bookings.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f8fafc] text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Station</th>
                  <th className="px-5 py-4 font-medium">Date</th>
                  <th className="px-5 py-4 font-medium">Slot</th>
                  <th className="px-5 py-4 font-medium">Connector</th>
                  <th className="px-5 py-4 font-medium">Amount</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id} className="border-t border-[#eef2f7] text-slate-600">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-800">{booking.stationName}</div>
                      <div className="text-xs text-slate-400">{booking.id}</div>
                    </td>
                    <td className="px-5 py-4">{formatReadableDate(booking.date)}</td>
                    <td className="px-5 py-4">{booking.slot}</td>
                    <td className="px-5 py-4">{booking.chargerType}</td>
                    <td className="px-5 py-4">{formatCurrency(booking.amount)}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs text-[#467ee5]">{booking.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </AppShell>
  );
}
