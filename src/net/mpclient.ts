/**
 * Thin WebSocket client for the LAN match server (server/mp-server.mjs).
 * JSON messages, per-type handler registry, silent no-op when closed.
 */

export interface LobbyPlayer {
  id: number;
  name: string;
  chassis: string;
  tons: number;
  team: string;
  ready: boolean;
}

export interface LobbyState {
  code: string;
  mode: 'dm' | 'tdm';
  host: number;
  players: LobbyPlayer[];
}

export interface RosterEntry {
  id: number;
  name: string;
  chassis: string;
  team: string;
  slot: number;
  /** non-playing robot filling an empty seat */
  bot?: boolean;
  /** the real pilot's net id that simulates this robot */
  owner?: number;
}

export interface StatePacket {
  p: [number, number, number];
  ly: number;
  ty: number;
  tp: number;
  sp: number;
  a: number[]; // armor % per zone (ZONES order)
  s: number[]; // structure % per zone
  d: number;   // destroyed bitmask
  h: number;   // heat fraction
}

type Handler = (msg: Record<string, unknown>) => void;

export class MpClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler>();
  private pending: Record<string, unknown>[] = [];
  /** When set, messages with no handler yet are queued and replayed the moment
   *  a handler registers — covers the match-start window where the world is
   *  still building (physics WASM load) but the server is already talking. */
  buffering = false;
  myId = 0;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const fail = (): void => reject(new Error('Match server unreachable. Start it with: npm run mp'));
      ws.onerror = fail;
      ws.onopen = () => {
        this.ws = ws;
        ws.onerror = () => this.handlers.get('__close')?.({ t: '__close' });
        ws.onclose = () => this.handlers.get('__close')?.({ t: '__close' });
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(String(e.data)) as Record<string, unknown>;
            if (msg.t === 'welcome') this.myId = msg.id as number;
            const h = this.handlers.get(msg.t as string);
            if (h) h(msg);
            else if (this.buffering && this.pending.length < 512) this.pending.push(msg);
          } catch { /* malformed frame — drop */ }
        };
        resolve();
      };
    });
  }

  on(type: string, fn: Handler): void {
    this.handlers.set(type, fn);
    if (this.pending.length) {
      const mine = this.pending.filter((m) => m.t === type);
      this.pending = this.pending.filter((m) => m.t !== type);
      for (const m of mine) fn(m);
    }
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    // an intentional close is not a transport failure — never fire __close
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }
    this.ws = null;
  }
}
