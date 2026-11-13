
import { connect } from "cloudflare:sockets";

const TARGET_HOST = "example.com";
const TARGET_PORT = 80;
const READ_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 32768;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readWithTimeout(reader, timeoutMs) {
  let timer;

  try {
    return await Promise.race([
      reader.read(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ timeout: true }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const startedAt = Date.now();

    let socket;
    let writer;
    let reader;
    let stage = "connect";
    let connectMs = null;
    let writeMs = null;
    let firstByteMs = null;
    let bytesReceived = 0;
    let responseText = "";
    let readOutcome = "not_started";
    let error = null;

    try {
      socket = connect({
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        secureTransport: "off",
      });

      await socket.opened;
      connectMs = Date.now() - startedAt;

      stage = "write";
      writer = socket.writable.getWriter();

      const payload = encoder.encode(
        "GET / HTTP/1.1\r\n" +
        `Host: ${TARGET_HOST}\r\n` +
        "User-Agent: syncc-tcp-probe\r\n" +
        "Accept: */*\r\n" +
        "Connection: close\r\n\r\n",
      );

      const writeStartedAt = Date.now();
      await writer.write(payload);
      writeMs = Date.now() - writeStartedAt;

      writer.releaseLock();
      writer = null;

      stage = "read";
      reader = socket.readable.getReader();

      const deadline = Date.now() + READ_TIMEOUT_MS;

      while (bytesReceived < MAX_RESPONSE_BYTES) {
        const remaining = deadline - Date.now();

        if (remaining <= 0) {
          readOutcome = "timeout";
          break;
        }

        const result = await readWithTimeout(reader, remaining);

        if (result.timeout) {
          readOutcome = "timeout";
          break;
        }

        if (result.done) {
          readOutcome = "closed";
          break;
        }

        if (firstByteMs === null) {
          firstByteMs = Date.now() - startedAt;
        }

        bytesReceived += result.value.byteLength;
        responseText += decoder.decode(result.value, { stream: true });

        if (bytesReceived >= MAX_RESPONSE_BYTES) {
          readOutcome = "max_bytes";
          break;
        }
      }
    } catch (cause) {
      error = {
        name: cause?.name ?? "Error",
        message: cause?.message ?? String(cause),
      };
    } finally {
      if (reader) {
        try {
          await reader.cancel();
        } catch {}
      }

      if (writer) {
        try {
          writer.releaseLock();
        } catch {}
      }

      if (socket) {
        try {
          socket.close();
        } catch {}
      }
    }

    const httpStatusLine = responseText.split("\r\n", 1)[0] || null;
    const httpResponseReceived =
      /^HTTP\/1\.[01] \d{3}/.test(httpStatusLine ?? "");

    return Response.json(
      {
        success: httpResponseReceived,
        target: `${TARGET_HOST}:${TARGET_PORT}`,
        stage,
        connectMs,
        writeMs,
        firstByteMs,
        totalMs: Date.now() - startedAt,
        bytesReceived,
        readOutcome,
        httpStatusLine,
        responsePreview: responseText.slice(0, 1200),
        error,
      },
      {
        status: httpResponseReceived
          ? 200
          : readOutcome === "timeout"
            ? 504
            : 502,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  },
};
