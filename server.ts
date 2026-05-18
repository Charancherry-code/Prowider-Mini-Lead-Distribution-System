import http from "node:http";

import next from "next";

import { initRealtimeServer } from "./src/server/realtime/socket";

const port = Number(process.env.PORT ?? 3000);
const isDevelopment = process.env.NODE_ENV !== "production";

async function main() {
  const app = next({ dev: isDevelopment });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = http.createServer((request, response) => {
    void handle(request, response);
  });

  initRealtimeServer(server);

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
}

void main();
