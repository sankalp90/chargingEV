import { useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppShell({ title, user, onLogout, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-800">
      <Sidebar
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={onLogout}
      />
      <Header title={title} user={user} onMenuClick={() => setSidebarOpen(true)} />
      <main className="min-h-screen px-4 pb-8 pt-24 xl:ml-[280px] xl:px-8">{children}</main>
    </div>
  );
}
