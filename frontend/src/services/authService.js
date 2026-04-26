import { apiConfig, buildAuthHeaders } from "./apiClient";
import { readJson, writeJson } from "./storage";

const SESSION_KEY = "ev-session";

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

const saveSession = (user, token) => {
  const session = { token, user };
  writeJson(SESSION_KEY, session);
  return session;
};

export const getStoredToken = () => readJson(SESSION_KEY, null)?.token ?? null;

export const getCurrentUser = () => readJson(SESSION_KEY, null)?.user ?? null;

export const login = async ({ email, password }) => {
  const data = await request("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return saveSession(data.user, data.token);
};

export const signup = async (payload) => {
  const data = await request("/auth/signup/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return saveSession(data.user, data.token);
};

export const googleLogin = async (accessToken) => {
  const data = await request("/auth/google/", {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken }),
  });
  return saveSession(data.user, data.token);
};

export const updateProfile = async (payload) => {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Please sign in again to update your profile.");
  }

  const updatedUser = await request("/auth/me/", {
    method: "PATCH",
    headers: buildAuthHeaders(token),
    body: JSON.stringify(payload),
  });

  const session = readJson(SESSION_KEY, null);
  writeJson(SESSION_KEY, { ...(session || {}), token, user: updatedUser });
  return updatedUser;
};

export const logout = () => {
  localStorage.removeItem(SESSION_KEY);
};
