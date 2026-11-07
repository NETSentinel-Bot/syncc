import worker from "../index.js";

const userID = "be0ff9df-1468-41a0-8865-796d1c6800db";

export default {
  async fetch(request) {
    const base = new URL(request.url).origin;
    const env = {};
    const ctx = {
      waitUntil(promise) {
        Promise.resolve(promise).catch(() => {});
      },
    };

    const cases = [
      ["root", "/"],
      ["panel", `/${userID}`],
      ["resolve-missing", "/resolve-domain"],
      ["resolve-ipv4", "/resolve-domain?domain=1.1.1.1"],
      ["proxy-host-info-missing", "/proxy-host-info"],
    ];

    const results = [];

    for (const [name, path] of cases) {
      try {
        const response = await worker.fetch(
          new Request(new URL(path, base)),
          env,
          ctx,
        );
        const body = await response.text();

        results.push({
          name,
          success: true,
          status: response.status,
          contentType: response.headers.get("Content-Type"),
          bodyLength: body.length,
          bodyPreview: body.length <= 160 ? body : undefined,
        });
      } catch (error) {
        results.push({
          name,
          success: false,
          errorName: error?.name,
          errorMessage: error?.message,
          stack: error?.stack,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: results.every((result) => result.success),
        total: results.length,
        passed: results.filter((result) => result.success).length,
        results,
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  },
};
