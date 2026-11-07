
import { handleConfigPage } from "../src/routes.js";

export default {
  async fetch(request) {
    try {
      const response = await handleConfigPage(
        "be0ff9df-1468-41a0-8865-796d1c6800db",
        new URL(request.url).hostname,
        "example.com:443",
        "syncc-debug",
        true,
      );

      return new Response(
        JSON.stringify({
          success: true,
          status: response.status,
          contentType: response.headers.get("Content-Type"),
          contentLength: response.headers.get("Content-Length"),
          bodyLength: (await response.text()).length,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
