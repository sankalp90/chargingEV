import { Link } from "react-router-dom";
import BrandMark from "./BrandMark";

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M10 17a2 2 0 0 0 4 0" />
    </svg>
  );
}

export default function Header({ title = "Dashboard", user, onMenuClick }) {
  const initial = user?.name?.charAt(0)?.toUpperCase() || "U";

  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-[#e2e8f0] bg-white px-4 py-3 xl:left-[280px] xl:px-8">
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="text-slate-500 transition hover:text-slate-800 xl:hidden">
          <MenuIcon />
        </button>

        <Link to="/dashboard">
          <BrandMark compact />
        </Link>

        <div>
          <p className="hidden text-xs uppercase tracking-[0.25em] text-slate-400 sm:block">EV Station Network</p>
          <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="grid h-10 w-10 place-items-center rounded-full bg-[#f8fafc] text-slate-500 transition hover:bg-[#eef2f7] hover:text-slate-800">
          <BellIcon />
        </button>
        <div className="flex items-center gap-2 rounded-full bg-[#f8fafc] px-3 py-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#467ee5] font-semibold text-white">
            {initial}
          </div>
          <div className="hidden sm:block">
            <div className="text-sm text-slate-800">{user?.name || "User"}</div>
            <div className="text-xs text-slate-500">{user?.membership || "Member"}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
