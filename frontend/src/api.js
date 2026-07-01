const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function getToken() {
  return localStorage.getItem("scms_token");
}

export function setSession(session) {
  localStorage.setItem("scms_token", session.token);
  localStorage.setItem("scms_user", JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem("scms_token");
  localStorage.removeItem("scms_user");
}

export function getUser() {
  const raw = localStorage.getItem("scms_user");
  return raw ? JSON.parse(raw) : null;
}

export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }
  return response.json();
}

export async function login(email, password) {
  const session = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  setSession(session);
  return session;
}
