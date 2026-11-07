import {
  parseHostAndPort,
  ProtocolOverWSHandler,
} from "../src/network.js";

export default {
  fetch() {
    return new Response(
      JSON.stringify({
        success: true,
        parsed: parseHostAndPort("example.com:443"),
        handlerType: typeof ProtocolOverWSHandler,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
