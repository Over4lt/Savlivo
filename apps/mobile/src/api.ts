import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export async function setToken(token: string) {
  await AsyncStorage.setItem("savlivo_token", token);
}

export async function getToken() {
  return AsyncStorage.getItem("savlivo_token");
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
