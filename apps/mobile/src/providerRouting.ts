import { Linking } from "react-native";

export async function openProviderUrl(url?: string) {
  if (!url) return false;

  const supported = await Linking.canOpenURL(url);

  if (!supported) return false;

  await Linking.openURL(url);

  return true;
}
