import "@testing-library/jest-dom";

// Polyfill globals required by Next.js 14 server route imports.
// These are referenced during module evaluation in next/dist/server/web/spec-extension/
if (typeof globalThis.Response === "undefined") {
  (globalThis as Record<string, unknown>).Response = class Response {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      void body; void init;
    }
    get ok() { return true; }
    get status() { return 200; }
    get headers() { return new Headers(); }
    async json(): Promise<unknown> { return {}; }
  } as unknown as typeof Response;
}
if (typeof globalThis.Request === "undefined") {
  (globalThis as Record<string, unknown>).Request = class Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === "string" ? input : (input as URL).href ?? String(input);
      Object.assign(this, { url, method: init?.method ?? "GET", headers: new Headers(init?.headers) });
    }
    get url() { return (this as Record<string, unknown>)._url as string; }
    get method() { return (this as Record<string, unknown>)._method as string; }
    get headers() { return (this as Record<string, unknown>)._headers as Headers; }
  } as unknown as typeof Request;
}
