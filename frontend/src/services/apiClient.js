export const apiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api",
  authHeader: "Authorization",
  tokenPrefix: "Bearer",
};

export const buildAuthHeaders = (token) =>
  token
    ? {
        [apiConfig.authHeader]: `${apiConfig.tokenPrefix} ${token}`,
        "Content-Type": "application/json",
      }
    : { "Content-Type": "application/json" };
