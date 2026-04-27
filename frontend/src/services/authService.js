import { apiConfig, buildAuthHeaders } from "./apiClient";
import { readJson, writeJson } from "./storage";

const SESSION_KEY = "ev-session";
const REFRESH_SKEW_SECONDS = 45;

const request = async (path, options = {}) => {
  const response = await fetch(`${apiConfig.baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (typeof data?.detail === "string") {
      throw new Error(data.detail);
    }
    if (Array.isArray(data?.non_field_errors) && data.non_field_errors[0]) {
      throw new Error(data.non_field_errors[0]);
    }
    if (data && typeof data === "object") {
      const firstEntry = Object.values(data).find((value) => Array.isArray(value) && value.length > 0);
      if (firstEntry) {
        throw new Error(firstEntry[0]);
      }
    }
    throw new Error("Request failed. Please try again.");
  }

  return data;
};

const saveSession = (user, token, refreshToken = null) => {
  const current = readJson(SESSION_KEY, null);
  const session = { token, user, refreshToken: refreshToken ?? current?.refreshToken ?? null };
  writeJson(SESSION_KEY, session);
  return session;
};

export const getStoredToken = () => readJson(SESSION_KEY, null)?.token ?? null;
export const getStoredRefreshToken = () => readJson(SESSION_KEY, null)?.refreshToken ?? null;

export const getCurrentUser = () => readJson(SESSION_KEY, null)?.user ?? null;

const decodeJwtPayload = (token) => {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const json = atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const isTokenNearExpiry = (token) => {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp - now <= REFRESH_SKEW_SECONDS;
};

export const refreshAccessToken = async () => {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const data = await request("/auth/refresh/", {
      method: "POST",
      body: JSON.stringify({ refresh: refreshToken }),
    });
    const session = readJson(SESSION_KEY, null);
    if (!session?.user || !data?.access) return null;
    const nextRefreshToken = data.refresh || refreshToken;
    return saveSession(session.user, data.access, nextRefreshToken);
  } catch {
    logout();
    return null;
  }
};

export const getValidToken = async () => {
  const token = getStoredToken();
  if (!token) return null;
  if (!isTokenNearExpiry(token)) return token;
  const refreshed = await refreshAccessToken();
  return refreshed?.token ?? null;
};

export const login = async ({ email, password }) => {
  const data = await request("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return saveSession(data.user, data.token, data.refresh_token);
};

export const signup = async (payload) => {
  const data = await request("/auth/signup/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return saveSession(data.user, data.token, data.refresh_token);
};

export const googleLogin = async (accessToken) => {
  const data = await request("/auth/google/", {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken }),
  });
  return saveSession(data.user, data.token, data.refresh_token);
};

export const updateProfile = async (payload) => {
  let token = await getValidToken();
  if (!token) {
    throw new Error("Please sign in again to update your profile.");
  }
  let updatedUser;
  try {
    updatedUser = await request("/auth/me/", {
      method: "PATCH",
      headers: buildAuthHeaders(token),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    token = (await refreshAccessToken())?.token ?? null;
    if (!token) throw error;
    updatedUser = await request("/auth/me/", {
      method: "PATCH",
      headers: buildAuthHeaders(token),
      body: JSON.stringify(payload),
    });
  }

  const session = readJson(SESSION_KEY, null);
  writeJson(SESSION_KEY, { ...(session || {}), token, user: updatedUser });
  return updatedUser;
};

export const logout = () => {
  localStorage.removeItem(SESSION_KEY);
};
