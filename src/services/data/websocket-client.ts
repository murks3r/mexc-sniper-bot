/**
 * WebSocket Client Stub
 *
 * Stub implementation for websocket client.
 * Real implementation would connect to WebSocket server.
 */

import type {
  ConnectionMetrics,
  MessageHandler,
  SubscriptionRequest,
  WebSocketChannel,
  WebSocketMessage,
} from "@/src/lib/websocket-types";

export type WebSocketClientState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export const webSocketClient = {
  connect: async (_token?: string) => Promise.resolve(),
  disconnect: () => {},
  reconnect: () => {},
  subscribe: (
    _channel: WebSocketChannel,
    _handler: MessageHandler,
    _request?: SubscriptionRequest,
  ) => {
    return () => {}; // Unsubscribe function
  },
  unsubscribe: (_channel: string) => {},
  getState: (): WebSocketClientState => "disconnected",
  getSubscriptions: (): string[] => [],
  getConnectionId: (): string | undefined => undefined,
  getMetrics: (): ConnectionMetrics | null => null,
  isConnected: (): boolean => false,
  send: <T>(_message: Omit<WebSocketMessage<T>, "messageId" | "timestamp">): boolean => true,
  on: (_event: string, _handler: (...args: unknown[]) => void) => {},
  off: (_event: string, _handler: (...args: unknown[]) => void) => {},
};
