import { Redirect, useLocalSearchParams } from "expo-router";

export default function ResetPasswordRoute() {
  const params = useLocalSearchParams<{
    token?: string;
  }>();

  const token =
    typeof params.token === "string"
      ? params.token
      : "";

  return (
    <Redirect
      href={{
        pathname: "/",
        params: {
          resetToken: token
        }
      }}
    />
  );
}
