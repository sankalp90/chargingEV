import { Link, useLocation, useNavigate } from "react-router-dom";
import BrandMark from "./BrandMark";

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
    </svg>
  );
}

function StationIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 2h7a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V4a2 2 0 0 1 2-2z" />
      <path d="M10 6h4M10 10h4" />
    </svg>
  );
}

function BookingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h18M7 3v4M17 3v4M5 11h14v10H5z" />
    </svg>
  );
}

function RecommendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M13 2 6 14h5l-1 8 8-12h-5z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM2 22c2-4 6-6 10-6s8 2 10 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { path: "/stations", label: "Charging Stations", icon: <StationIcon /> },
  { path: "/booking", label: "Book Slot", icon: <BookingIcon /> },
  { path: "/bookings", label: "My Bookings", icon: <BookingIcon /> },
  { path: "/recommendations", label: "Recommendations", icon: <RecommendIcon /> },
  { path: "/profile", label: "Profile", icon: <ProfileIcon /> },
];

export default function Sidebar({ user, isOpen = false, onClose, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout?.();
    navigate("/");
  };

  return (
    <>
      {isOpen ? <button onClick={onClose} className="fixed inset-0 z-40 bg-slate-900/20 xl:hidden" aria-label="Close menu" /> : null}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-[280px] flex-col border-r border-[#e2e8f0] bg-white px-4 py-5 text-slate-700 transition-transform duration-300 ${isOpen ? "translate-x-0" : "-translate-x-full"} xl:translate-x-0`}
      >
        <div className="mb-6 flex items-center justify-between">
          <Link to="/dashboard" onClick={onClose}>
            <BrandMark />
          </Link>

          <button onClick={onClose} className="text-slate-400 transition hover:text-slate-700 xl:hidden">
            <CloseIcon />
          </button>
        </div>

        <div className="mb-6 rounded-2xl bg-[#d9edff] p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Charging Pulse</p>
          <h3 className="mt-3 text-lg font-semibold text-slate-800">7 stations are currently available nearby</h3>
          <p className="mt-2 text-sm text-slate-600">Best rates and fastest chargers refresh every few minutes.</p>
        </div>

        <nav className="flex flex-col gap-2">
          {navItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  active
                    ? "bg-[#e9f1ff] text-[#467ee5]"
                    : "text-slate-600 hover:bg-[#f8fafc] hover:text-slate-800"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="rounded-2xl bg-[#f8fafc] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Signed In As</div>
            <div className="mt-2 font-semibold text-slate-800">{user?.name || "User"}</div>
            <div className="text-sm text-slate-500">{user?.email || ""}</div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full rounded-xl bg-[#467ee5] py-3 text-sm font-medium text-white transition hover:bg-[#3f74d7]"
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
