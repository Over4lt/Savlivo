import AsyncStorage from "@react-native-async-storage/async-storage";

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = __DEV__
  ? configuredApiUrl || "http://localhost:3000"
  : "https://savlivo-api.onrender.com";

let sessionToken: string | null = null;

export async function setToken(
  token: string,
  persist = true
) {
  sessionToken = token;
  if (persist) {
    await AsyncStorage.setItem("savlivo_token", token);
  } else {
    await AsyncStorage.removeItem("savlivo_token");
  }
}

export async function getToken() {
  if (sessionToken) return sessionToken;
  const persistedToken =
    await AsyncStorage.getItem("savlivo_token");
  if (persistedToken) {
    sessionToken = persistedToken;
  }
  return persistedToken;
}

export async function clearToken() {
  sessionToken = null;
  await AsyncStorage.removeItem("savlivo_token");
}

export async function api<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error ?? "REQUEST_FAILED");
    (error as any).status = res.status;
    (error as any).body = body;
    throw error;
  }
  return body as T;
}
