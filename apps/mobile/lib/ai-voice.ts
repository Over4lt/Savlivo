import {
  API_URL,
  getToken
} from "../src/api";

export async function transcribeSavlivoVoice(
  uri: string
) {
  const token =
    await getToken();

  const form =
    new FormData();

  form.append(
    "file",
    {
      uri,
      name: "savlivo-voice.m4a",
      type: "audio/m4a"
    } as any
  );

  const response =
    await fetch(
      `${API_URL}/v1/assistant/transcribe`,
      {
        method: "POST",
        headers: {
          ...(token
            ? {
                authorization:
                  `Bearer ${token}`
              }
            : {})
        },
        body: form
      }
    );

  const body =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    const error =
      new Error(
        body.error ??
        "TRANSCRIPTION_FAILED"
      );

    (error as any).body =
      body;

    (error as any).status =
      response.status;

    throw error;
  }

  return String(
    body.text ?? ""
  ).trim();
}
