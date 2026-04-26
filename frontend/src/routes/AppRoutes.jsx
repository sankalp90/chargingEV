import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import BookingPage from "../pages/BookingPage";
import Dashboard from "../pages/Dashboard";
import Login from "../pages/Login";
import MyBookings from "../pages/MyBookings";
import Profile from "../pages/Profile";
import Recommendations from "../pages/Recommendations";
import Signup from "../pages/Signup";
import StationDetails from "../pages/StationDetails";
import Stations from "../pages/Stations";
import { googleLogin, login, logout, signup, updateProfile } from "../services/authService";

function AppRoutes({ auth, setAuth }) {
  const handleAuthSuccess = (session) => {
    setAuth(session);
  };

  const handleLogin = async (values) => {
    const session = await login(values);
    handleAuthSuccess(session);
  };

  const handleGoogleLogin = async (accessToken) => {
    const session = await googleLogin(accessToken);
    handleAuthSuccess(session);
  };

  const handleSignup = async (values) => {
    const session = await signup(values);
    handleAuthSuccess(session);
  };

  const handleLogout = () => {
    logout();
    setAuth({ user: null, token: null });
  };

  const handleProfileUpdate = async (values) => {
    const user = await updateProfile(values);
    setAuth((current) => ({ ...current, user }));
  };

  return (
    <Routes>
      <Route
        path="/"
        element={<Login token={auth.token} onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} />}
      />
      <Route
        path="/signup"
        element={<Signup token={auth.token} onSignup={handleSignup} />}
      />

      <Route element={<ProtectedRoute token={auth.token} />}>
        <Route
          path="/dashboard"
          element={<Dashboard user={auth.user} onLogout={handleLogout} />}
        />
        <Route
          path="/stations"
          element={<Stations user={auth.user} onLogout={handleLogout} />}
        />
        <Route
          path="/stations/:stationId"
          element={<StationDetails user={auth.user} onLogout={handleLogout} />}
        />
        <Route
          path="/booking"
          element={<BookingPage user={auth.user} onLogout={handleLogout} />}
        />
        <Route
          path="/bookings"
          element={<MyBookings user={auth.user} onLogout={handleLogout} />}
        />
        <Route
          path="/recommendations"
          element={<Recommendations user={auth.user} onLogout={handleLogout} />}
        />
        <Route
          path="/profile"
          element={
            <Profile
              user={auth.user}
              onLogout={handleLogout}
              onProfileUpdate={handleProfileUpdate}
            />
          }
        />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
