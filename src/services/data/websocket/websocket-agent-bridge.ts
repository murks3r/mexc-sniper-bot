import type { TradingSignalMessage } from "@/src/lib/websocket-types";

export interface WebSocketAgentBridge {
  isRunning(): boolean;
  broadcastTradingSignal(signal: TradingSignalMessage): Promise<void>;
}

export const webSocketAgentBridge: WebSocketAgentBridge = {
  isRunning: () => false,
  async broadcastTradingSignal() {
    // Agent bridge is disabled by default.
  },
};
