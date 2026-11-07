import { connect } from "cloudflare:sockets";

export default {
  fetch() {
    return new Response(
      JSON.stringify({
        success: true,
        connectType: typeof connect,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
