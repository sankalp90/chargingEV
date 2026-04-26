import { useState, useTransition } from "react";
import AppShell from "../components/AppShell";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";

export default function Profile({ user, onLogout, onProfileUpdate }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    ...user,
  });

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    startTransition(async () => {
      try {
        await onProfileUpdate(form);
        setMessage("Profile updated successfully.");
      } catch (err) {
        setError(err.message);
      }
    });
  };

  return (
    <AppShell title="Profile" user={user} onLogout={onLogout}>
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex h-18 w-18 items-center justify-center rounded-full bg-[#467ee5] text-2xl font-semibold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-800">{user?.name}</h2>
              <p className="text-slate-500">{user?.email}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4 text-sm text-slate-600">
            <div className="rounded-2xl bg-[#f8fafc] p-4">
              <div className="text-slate-400">Membership</div>
              <div className="mt-2 text-lg font-medium text-slate-800">{user?.membership}</div>
            </div>
            <div className="rounded-2xl bg-[#f8fafc] p-4">
              <div className="text-slate-400">Preferred Vehicle</div>
              <div className="mt-2 text-lg font-medium text-slate-800">{user?.vehicleModel || "Add vehicle details"}</div>
            </div>
          </div>
        </Card>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Input label="Full Name" value={form.name || ""} onChange={handleChange("name")} />
              <Input label="Email" type="email" value={form.email || ""} onChange={handleChange("email")} />
              <Input label="Phone" value={form.phone || ""} onChange={handleChange("phone")} />
              <Input label="City" value={form.city || ""} onChange={handleChange("city")} />
              <Input label="Vehicle Model" value={form.vehicleModel || ""} onChange={handleChange("vehicleModel")} />
              <Input label="Vehicle Number" value={form.vehicleNumber || ""} onChange={handleChange("vehicleNumber")} />
            </div>

            {message ? <div className="rounded-2xl bg-[#eff6ff] px-4 py-3 text-sm text-[#467ee5]">{message}</div> : null}
            {error ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-500">{error}</div> : null}

            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
