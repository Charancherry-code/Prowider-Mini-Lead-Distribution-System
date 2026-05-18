import type { Server as HttpServer } from "node:http";

import { Server as SocketIOServer, type Socket } from "socket.io";

import { env } from "@/config/env";

import {
  RealtimeEvents,
  type DashboardUpdatedPayload,
  type LeadAssignedPayload,
} from "./events";

const providerRoom = (providerId: string) => `provider:${providerId}`;

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

  io.on("connection", (socket: Socket) => {
    socket.on(
      RealtimeEvents.ProviderJoined,
      ({ providerId }: { providerId: string }) => {
        socket.join(providerRoom(providerId));
      },
    );

    socket.on(
      RealtimeEvents.ProviderLeft,
      ({ providerId }: { providerId: string }) => {
        socket.leave(providerRoom(providerId));
      },
    );
  });

  global.socketServer = io;
  return io;
}

export function emitLeadAssigned(payload: LeadAssignedPayload) {
  global.socketServer
    ?.to(providerRoom(payload.providerId))
    .emit(RealtimeEvents.LeadAssigned, payload);
  global.socketServer?.emit(RealtimeEvents.LeadAssigned, payload);
}

export function emitDashboardUpdated(payload: DashboardUpdatedPayload) {
  global.socketServer?.emit(RealtimeEvents.DashboardUpdated, payload);
}
