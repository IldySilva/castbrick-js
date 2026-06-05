import type { PushEvent, PushEventHandler, PushClientStatus } from "./types.js";

interface PushClientOptions {
  baseUrl?: string;
  onConnected?: (channels: string[]) => void;
  onDisconnected?: () => void;
  onError?: (error: Event) => void;
  onStatusChange?: (status: PushClientStatus) => void;
}

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export class CastBrickPushClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly options: PushClientOptions;

  private source: EventSource | null = null;
  private handlers = new Map<string, Set<PushEventHandler>>();
  private lastEventId = "";
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private destroyed = false;
  private status: PushClientStatus = "disconnected";

  constructor(token: string, options: PushClientOptions = {}) {
    this.token = token;
    this.baseUrl = (options.baseUrl ?? "https://api.castbrick.co").replace(/\/$/, "");
    this.options = options;
    this.connect();
  }

  /** Subscribe to events on a specific channel. Returns an unsubscribe function. */
  on(channel: string, handler: PushEventHandler): () => void {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel)!.add(handler);
    return () => this.handlers.get(channel)?.delete(handler);
  }

  /** Disconnect and stop reconnecting */
  disconnect(): void {
    this.destroyed = true;
    this.clearReconnect();
    this.source?.close();
    this.source = null;
    this.setStatus("disconnected");
    this.options.onDisconnected?.();
  }

  private connect(): void {
    if (this.destroyed) return;

    this.clearReconnect();
    this.setStatus("connecting");

    const url = new URL(`${this.baseUrl}/push/stream`);
    url.searchParams.set("token", this.token);
    if (this.lastEventId) url.searchParams.set("lastEventId", this.lastEventId);

    const source = new EventSource(url.toString());
    this.source = source;

    source.addEventListener("connected", (e: MessageEvent) => {
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.setStatus("connected");
      try {
        const { channels } = JSON.parse(e.data) as { channels: string[] };
        this.options.onConnected?.(channels);
      } catch {}
    });

    source.addEventListener("message", (e: MessageEvent) => {
      if (e.lastEventId) this.lastEventId = e.lastEventId;
      try {
        const evt = JSON.parse(e.data) as PushEvent;
        this.handlers.get(evt.channel)?.forEach((fn) => fn(evt));
      } catch {}
    });

    source.onerror = (e: Event) => {
      this.setStatus("error");
      source.close();
      this.source = null;
      this.options.onError?.(e);
      if (!this.destroyed) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private setStatus(s: PushClientStatus): void {
    if (this.status !== s) {
      this.status = s;
      this.options.onStatusChange?.(s);
    }
  }
}
