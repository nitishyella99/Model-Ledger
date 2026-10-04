import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch { return false; }
}
export async function assertPublicEndpoint(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) throw new Error("Use a public HTTPS endpoint without embedded credentials or a custom port.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("The endpoint must resolve only to public network addresses.");
  return { url, address: addresses[0] };
}
/** Resolve and pin the connection address, preventing DNS rebinding. Redirects are never followed. */
export async function safeModelFetch(value: string | URL | Request, init?: RequestInit): Promise<Response> {
  const target = await assertPublicEndpoint(String(value));
  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const req = request(target.url, {
      method: init?.method || "GET", headers, signal: init?.signal ?? undefined,
      // Pin the address family too: a nonzero family disables Node's automatic
      // family selection, so lookup is called in single-address mode.
      family: target.address.family,
      lookup: (_hostname, _options, callback) => callback(null, target.address.address, target.address.family),
    }, res => {
      const chunks: Buffer[] = []; let bytes = 0;
      res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 8_000_000) req.destroy(new Error("Model response exceeded 8 MB.")); else chunks.push(chunk); });
      res.on("error", reject);
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) { reject(new Error("Model endpoint redirects are not allowed.")); return; }
        try {
          const status=res.statusCode || 502;
          resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks), { status, headers: { "content-type": String(res.headers["content-type"] || "application/json") } }));
        } catch(error) { reject(error); }
      });
    });
    req.setTimeout(120_000, () => req.destroy(new Error("Model request timed out.")));
    req.on("error", reject);
    if (typeof init?.body === "string") req.write(init.body);
    req.end();
  });
}
