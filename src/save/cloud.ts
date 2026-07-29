/**
 * Client half of the pilot registry — where the account API lives and how to
 * talk to it. Transport only: no caching, no merge policy, no UI (those are
 * ProfileStore's job).
 *
 * The passcode never crosses the wire. deriveVerifier() stretches it on this
 * device with 200k PBKDF2 rounds and only the derived verifier is sent — see
 * server/credentials.mjs for why the KDF is split across client and service.
 */

import { deriveVerifier } from '../../server/credentials.mjs';
import type { Progress } from './profiles';

export interface CloudAccount {
  id: string;
  callsign: string;
  createdAt: number;
}

export interface CloudSession {
  token: string;
  account: CloudAccount;
  progress: Progress;
  rev: number;
  expiresAt: number;
}

export interface CloudProgress {
  rev: number;
  progress: Progress;
  updatedAt?: number;
  device?: string;
  /** the session's CURRENT expiry — it slides server-side on every use, so the
   *  client refreshes its stored copy from this rather than trusting a value
   *  frozen at sign-in */
  sessionExpiresAt?: number;
}

/** A refused request that reached the service — status and code are meaningful. */
export class CloudError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly payload?: CloudProgress) {
    super(message);
  }
}

/** The service could not be reached at all. Distinct from CloudError because
 *  the caller's response is completely different: keep the local copy, keep
 *  playing, retry later. */
export class OfflineError extends Error {
  constructor(message = 'Cannot reach the pilot registry.') {
    super(message);
  }
}

/**
 * Where the account API lives — same resolution order as the match server:
 *   local/LAN  → the Node dev server on :4177
 *   configured → VITE_API_URL (production: the veyra-prime Worker)
 *   otherwise  → same-origin /api
 */
export function apiBase(): string {
  const h = location.hostname;
  const local = h === 'localhost' || h.startsWith('127.') || h.startsWith('192.168.') || h.startsWith('10.') || h.endsWith('.local');
  if (local) return `http://${h}:4177/api`;
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured) return configured.replace(/\/+$/, '');
  return `${location.origin}/api`;
}

/** Stable, human-readable label for this device, shown in "last played on…". */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
      : /Mac OS X/.test(ua) ? 'macOS'
        : /Windows/.test(ua) ? 'Windows'
          : /Linux/.test(ua) ? 'Linux' : 'Web';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari'
          : /Firefox\//.test(ua) ? 'Firefox' : 'browser';
  return `${browser} on ${os}`;
}

interface RequestOpts {
  method?: string;
  token?: string;
  body?: unknown;
  /** survives page teardown — used for the last-gasp flush on pagehide */
  keepalive?: boolean;
  timeoutMs?: number;
}

export class CloudClient {
  constructor(private base: string = apiBase()) {}

  get baseUrl(): string {
    return this.base;
  }

  private async request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        keepalive: opts.keepalive,
        signal: controller.signal,
        // the token is an Authorization header, never a cookie: third-party
        // cookies are blocked by default on Safari/Firefox, which is precisely
        // the cross-origin case this API runs in
        credentials: 'omit',
        mode: 'cors',
      });
    } catch {
      throw new OfflineError();
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text().catch(() => '');
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      if (res.ok) throw new CloudError(res.status, 'BAD_RESPONSE', 'The registry sent something unreadable.');
    }
    if (!res.ok) {
      const payload = body.progress !== undefined && body.rev !== undefined
        ? {
          rev: body.rev as number,
          progress: body.progress as Progress,
          updatedAt: body.updatedAt as number,
          device: body.device as string,
          sessionExpiresAt: body.sessionExpiresAt as number | undefined,
        }
        : undefined;
      // 502/503/504 are the registry being down rather than refusing — the
      // caller should treat those like being offline, not like a bad passcode
      if (res.status >= 502 && res.status <= 504) throw new OfflineError('The pilot registry is unavailable.');
      throw new CloudError(res.status, String(body.error ?? 'ERROR'), String(body.message ?? `Request failed (${res.status})`), payload);
    }
    return body as T;
  }

  async health(): Promise<boolean> {
    try {
      await this.request('/health', { timeoutMs: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async register(callsign: string, passcode: string, device: string): Promise<CloudSession> {
    const verifier = await deriveVerifier(passcode, callsign);
    return this.request<CloudSession>('/auth/register', { method: 'POST', body: { callsign, verifier, device } });
  }

  async login(callsign: string, passcode: string, device: string): Promise<CloudSession> {
    const verifier = await deriveVerifier(passcode, callsign);
    return this.request<CloudSession>('/auth/login', { method: 'POST', body: { callsign, verifier, device } });
  }

  async me(token: string): Promise<{ account: CloudAccount; progress: Progress; rev: number }> {
    return this.request('/auth/me', { token });
  }

  async logout(token: string): Promise<void> {
    await this.request('/auth/logout', { method: 'POST', token });
  }

  async pullProgress(token: string, timeoutMs?: number): Promise<CloudProgress> {
    return this.request<CloudProgress>('/progress', { token, timeoutMs });
  }

  /** @throws {CloudError} 409 REV_CONFLICT carrying the service's copy in `payload` */
  async pushProgress(token: string, baseRev: number, progress: Progress, device: string, keepalive = false): Promise<{ rev: number; sessionExpiresAt?: number }> {
    return this.request<{ rev: number; sessionExpiresAt?: number }>('/progress', {
      method: 'PUT',
      token,
      body: { baseRev, progress, device },
      keepalive,
      timeoutMs: keepalive ? 4000 : 12_000,
    });
  }
}

export { deriveVerifier };
