import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type http from "node:http";

import Busboy from "busboy";
import Groq from "groq-sdk";

const groq =
  process.env.GROQ_API_KEY
    ? new Groq({
        apiKey: process.env.GROQ_API_KEY
      })
    : null;

type UploadedAudio = {
  path: string;
  filename: string;
  mimeType: string;
};

export function receiveAudioUpload(
  req: http.IncomingMessage
): Promise<UploadedAudio> {
  return new Promise(
    (resolve, reject) => {
      const busboy = Busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: 25 * 1024 * 1024
        }
      });

      let upload:
        | UploadedAudio
        | null = null;

      let writeFinished:
        | Promise<void>
        | null = null;

      busboy.on(
        "file",
        (
          fieldName,
          file,
          info
        ) => {
          if (
            fieldName !== "file"
          ) {
            file.resume();
            return;
          }

          const extension =
            path.extname(
              info.filename || ""
            ) || ".m4a";

          const temporaryPath =
            path.join(
              os.tmpdir(),
              `savlivo-voice-${crypto.randomUUID()}${extension}`
            );

          const output =
            fs.createWriteStream(
              temporaryPath
            );

          upload = {
            path: temporaryPath,
            filename:
              info.filename ||
              `voice${extension}`,
            mimeType:
              info.mimeType ||
              "audio/mp4"
          };

          writeFinished =
            new Promise(
              (
                resolveWrite,
                rejectWrite
              ) => {
                output.on(
                  "finish",
                  resolveWrite
                );

                output.on(
                  "error",
                  rejectWrite
                );
              }
            );

          file.on(
            "limit",
            () => {
              reject(
                new Error(
                  "AUDIO_FILE_TOO_LARGE"
                )
              );
            }
          );

          file.pipe(output);
        }
      );

      busboy.on(
        "error",
        reject
      );

      busboy.on(
        "finish",
        async () => {
          try {
            if (
              !upload ||
              !writeFinished
            ) {
              throw new Error(
                "AUDIO_FILE_MISSING"
              );
            }

            await writeFinished;

            resolve(upload);
          } catch (err) {
            reject(err);
          }
        }
      );

      req.pipe(busboy);
    }
  );
}

export async function transcribeAudio(
  upload: UploadedAudio
) {
  if (!groq) {
    throw new Error(
      "GROQ_API_KEY_MISSING"
    );
  }

  try {
    const transcription =
      await groq.audio.transcriptions.create({
        file:
          fs.createReadStream(
            upload.path
          ),
        model:
          process.env
            .GROQ_TRANSCRIPTION_MODEL ??
          "whisper-large-v3-turbo",
        response_format: "json",
        temperature: 0,
        prompt:
          "Savlivo subscription assistant. Preserve service names such as Netflix, Max, Spotify, YouTube Premium, Disney+, Prime Video and Apple TV+."
      });

    return {
      text:
        transcription.text
          ?.trim() ?? ""
    };
  } finally {
    await fs.promises
      .unlink(upload.path)
      .catch(() => {});
  }
}
