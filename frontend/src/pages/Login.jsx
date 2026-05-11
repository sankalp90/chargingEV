import { useState, useTransition } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import SocialButton from "../components/ui/SocialButton";
import {GoogleIcon} from "../components/ui/Icons";

const initialCredentials = {
  email: "",
  password: "",
};

const GOOGLE_GSI_SCRIPT = "https://accounts.google.com/gsi/client";

const loadGoogleScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.querySelector(`script[src="${GOOGLE_GSI_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Google authentication.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_GSI_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Google authentication."));
    document.head.appendChild(script);
  });

const Login = ({ token, onLogin, onGoogleLogin }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(initialCredentials);
  const [error, setError] = useState("");

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        await onLogin(form);
        navigate(location.state?.from || "/dashboard");
      } catch (err) {
        setError(err.message);
      }
    });
  };

  const handleGoogleSignIn = async () => {
    setError("");
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError("Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID in frontend .env.");
      return;
    }

    try {
      await loadGoogleScript();
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        callback: async (tokenResponse) => {
          if (!tokenResponse?.access_token) {
            setError("Google sign-in was cancelled.");
            return;
          }
          try {
            await onGoogleLogin(tokenResponse.access_token);
            navigate(location.state?.from || "/dashboard");
          } catch (err) {
            setError(err.message);
          }
        },
      });
      tokenClient.requestAccessToken();
    } catch (err) {
      setError(err.message || "Google sign-in failed.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] px-4 py-8 text-slate-800">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-[1240px] overflow-hidden rounded-[28px] bg-[#d9edff] shadow-[0_18px_45px_rgba(15,23,42,0.12)] lg:grid-cols-[1.35fr_0.9fr]">
          <div className="flex flex-col justify-center px-10 py-14 sm:px-16 lg:px-20">
            <BrandMark />
            <h1 className="mt-16 text-[3.3rem] font-normal leading-[1.35] text-[#1e293b] sm:text-[4rem]">
              Welcome Back
              <br />
              Rider
            </h1>
            <p className="mt-16 max-w-[540px] text-[1.35rem] leading-[1.7] text-slate-600">
              Locate, compare, and book EV charging stations with real-time availability no more uncertainty or long waits.
            </p>
          </div>

          <div className="flex items-center justify-center bg-white px-6 py-10 sm:px-12">
            <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5">
              <div className="text-center">
                <h2 className="text-4xl font-semibold text-[#102a4f]">Sign In</h2>
              </div>

              <Input type="email" value={form.email} onChange={handleChange("email")} placeholder="Enter Your Email" required />
              <Input type="password" value={form.password} onChange={handleChange("password")} placeholder="Enter Password" required />

              {error ? <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-500">{error}</div> : null}

              <Button type="submit" className="w-full rounded-lg" disabled={isPending}>
                {isPending ? "Signing in..." : "Log In"}
              </Button>

              <div className="py-1 text-center text-[1.15rem] text-slate-400">OR</div>

              <div className="grid gap-4">
                <SocialButton icon={<GoogleIcon />} text="Continue with Google" onClick={handleGoogleSignIn} />
              </div>

              <p className="text-center text-sm text-slate-500">
                New to the platform?{" "}
                <Link to="/signup" className="font-medium text-[#467ee5] hover:text-[#3f74d7]">
                  Create an account
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
