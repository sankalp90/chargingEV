import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function ProtectedRoute({ token }) {
  const location = useLocation();

  if (!token) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
