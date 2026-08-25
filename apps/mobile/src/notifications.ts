import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
});

export async function registerSavlivoPushNotifications() {
  if (Platform.OS === "web") return null;
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await api("/v1/notifications/push-token", {
    method: "POST",
    body: JSON.stringify({ token, platform: Platform.OS })
  });
  return token;
}

export function subscribeToSavlivoNotificationTaps(onOpen: (subscriptionId: string, field?: string) => void) {
  const open = (response: Notifications.NotificationResponse) => {
    const data: any = response.notification.request.content.data ?? {};
    if (data.subscriptionId) onOpen(String(data.subscriptionId), data.field ? String(data.field) : undefined);
  };
  const listener = Notifications.addNotificationResponseReceivedListener(open);
  Notifications.getLastNotificationResponseAsync().then((response) => response && open(response)).catch(() => {});
  return () => listener.remove();
}
