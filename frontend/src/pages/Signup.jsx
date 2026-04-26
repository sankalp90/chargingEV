import { useState, useTransition } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { validateSignupForm } from "../utils/validators";

const initialForm = {
  name: "",
  email: "",
  phone: "",
  city: "",
  vehicleModel: "",
  vehicleNumber: "",
  password: "",
  confirmPassword: "",
};

export default function Signup({ token, onSignup }) {
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validateSignupForm(form);
    setErrors(nextErrors);
    setFormError("");

    if (Object.keys(nextErrors).length > 0) return;

    startTransition(async () => {
      try {
        const payload = { ...form };
        delete payload.confirmPassword;
        await onSignup(payload);
        navigate("/dashboard");
      } catch (error) {
        setFormError(error.message);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] px-4 py-8 text-slate-800">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.12)] lg:grid-cols-[0.95fr_1.05fr]">
        <div className="flex flex-col justify-between bg-[#d9edff] p-8 sm:p-12">
          <BrandMark />
          <div className="space-y-5">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">JWT-ready onboarding</p>
            <h1 className="text-4xl font-semibold leading-tight text-slate-800">Create your EV charging account in a few steps.</h1>
            <p className="text-slate-600">
              Signup sends your details directly to the live Django REST auth endpoints so your account is immediately available across the app.
            </p>
          </div>
          <div className="grid gap-4 text-sm text-slate-600">
            <div className="rounded-2xl bg-white/60 p-4">Token-based auth is backed by backend JWT responses and persisted only for session continuity.</div>
            <div className="rounded-2xl bg-white/60 p-4">Vehicle details help match compatible chargers and personalize recommendations.</div>
          </div>
        </div>

        <div className="p-6 sm:p-10">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Input label="Full Name" value={form.name} onChange={handleChange("name")} error={errors.name} placeholder="Aarav Sharma" />
              <Input label="Email" type="email" value={form.email} onChange={handleChange("email")} error={errors.email} placeholder="name@example.com" />
              <Input label="Phone" value={form.phone} onChange={handleChange("phone")} error={errors.phone} placeholder="+91 98765 43210" />
              <Input label="City" value={form.city} onChange={handleChange("city")} placeholder="Noida" />
              <Input label="Vehicle Model" value={form.vehicleModel} onChange={handleChange("vehicleModel")} placeholder="Tata Nexon EV" />
              <Input label="Vehicle Number" value={form.vehicleNumber} onChange={handleChange("vehicleNumber")} placeholder="UP16EV2026" />
              <Input label="Password" type="password" value={form.password} onChange={handleChange("password")} error={errors.password} placeholder="Minimum 6 characters" />
              <Input
                label="Confirm Password"
                type="password"
                value={form.confirmPassword}
                onChange={handleChange("confirmPassword")}
                error={errors.confirmPassword}
                placeholder="Repeat password"
              />
            </div>

            {formError ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-500">{formError}</div> : null}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating account..." : "Create Account"}
            </Button>

            <p className="text-center text-sm text-slate-500 md:text-left">
              Already have an account?{" "}
              <Link to="/" className="font-medium text-[#467ee5] hover:text-[#3f74d7]">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
