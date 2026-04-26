import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import AppErrorBoundary from "./components/AppErrorBoundary";
import AppRoutes from "./routes/AppRoutes";
import { getCurrentUser, getStoredToken } from "./services/authService";

function App() {
  const [auth, setAuth] = useState({
    user: getCurrentUser(),
    token: getStoredToken(),
  });

  useEffect(() => {
    const syncAuth = () => {
      setAuth({
        user: getCurrentUser(),
        token: getStoredToken(),
      });
    };

    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, []);

  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <AppRoutes auth={auth} setAuth={setAuth} />
      </AppErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
