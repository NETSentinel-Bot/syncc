import { parseHostAndPort, ProtocolOverWSHandler } from "../src/network.js";

export default {
  fetch() {
    try {
      const parsed = parseHostAndPort("example.com:443");

      return new Response(
        JSON.stringify({
          success: true,
          parsed,
          handlerType: typeof ProtocolOverWSHandler,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          name: error.name,
          message: error.message,
          stack: error.stack,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
