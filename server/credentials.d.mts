// Type surface of the shared credential primitives (credentials.mjs).

export declare const CLIENT_KDF: {
  version: number;
  hash: string;
  iterations: number;
  bytes: number;
  saltPrefix: string;
};

export declare const SERVER_KDF: { hash: string; iterations: number; bytes: number };

export declare const CALLSIGN_RE: RegExp;
export declare const MIN_PASSCODE: number;

export declare function toHex(buf: ArrayBuffer | ArrayBufferView): string;
export declare function sha256hex(str: string): Promise<string>;
export declare function callsignKey(callsign: string): string;
export declare function normalizeCallsign(callsign: string): string;
/** @throws {Error} with player-facing copy when the callsign is not legal */
export declare function assertCallsign(callsign: string): string;
export declare function deriveVerifier(passcode: string, callsign: string): Promise<string>;
export declare function hashVerifier(verifier: string, saltHex: string): Promise<string>;
export declare function hexToBytes(hex: string): Uint8Array;
export declare function randomHex(bytes: number): string;
export declare function randomToken(): string;
export declare function timingSafeEqual(a: string, b: string): boolean;
