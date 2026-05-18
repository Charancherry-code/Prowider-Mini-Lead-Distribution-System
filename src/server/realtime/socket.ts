import type { Server as HttpServer } from "node:http";

import { Server as SocketIOServer } from "socket.io";

import { env } from "@/config/env";

import {
  RealtimeEvents,
  type DashboardUpdatedPayload,
} from "./events";

declare global {
  var socketServer: SocketIOServer | undefined;
}

export function initRealtimeServer(server: HttpServer) {
  if (global.socketServer) {
    return global.socketServer;
  }

  const io = new SocketIOServer(server, {
    path: env.SOCKET_IO_PATH,
    cors: {
      origin: env.NEXT_PUBLIC_APP_URL ? [env.NEXT_PUBLIC_APP_URL] : true,
      credentials: true,
    },
  });

  global.socketServer = io;
  return io;
}

export function emitDashboardUpdated(payload: DashboardUpdatedPayload) {
  global.socketServer?.emit(RealtimeEvents.DashboardUpdated, payload);
}
