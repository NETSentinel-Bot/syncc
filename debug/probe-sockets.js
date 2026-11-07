import { parseHostAndPort } from "../src/network.js";

export default {
  fetch() {
    return new Response(
      JSON.stringify({
        success: true,
        parsed: parseHostAndPort("example.com:443"),
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
