"use client";

import { useEffect, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { RealtimeEvents } from "@/server/realtime/events";

export interface ProviderUpdate {
  timestamp: number;
  allocatedProviders: string[];
  leadId: string;
}

export function useProviderUpdates(onUpdate: (update: ProviderUpdate) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  const connect = useCallback((onUpdateFn: (update: ProviderUpdate) => void) => {
    const socketInstance = io({
      path: "/socket.io/",
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketInstance.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to real-time server");
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
      console.log("Disconnected from real-time server");
    });

    socketInstance.on(
      RealtimeEvents.DashboardUpdated,
      (payload: ProviderUpdate) => {
        onUpdateFn(payload);
      },
    );

    socketInstance.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    setSocket(socketInstance);

    return socketInstance;
  }, []);

  useEffect(() => {
    const socketInstance = connect(onUpdate);

    return () => {
      socketInstance.disconnect();
    };
  }, [connect, onUpdate]);

  return { isConnected, socket };
}
