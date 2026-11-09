import "server-only";

import { lookup, type LookupAddress, type LookupAllOptions, type LookupOneOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { AppError } from "../errors";

/** Plages privées, locales ou réservées : jamais joignables depuis une URL fournie par un client. */
export function isPrivateAddress(address: string): boolean {
  let ip = address.toLowerCase();
  // IPv4 encodée en IPv6, forme hexadécimale comprise (::ffff:a9fe:a9fe).
  const mapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const [high, low] = [parseInt(mapped[1]!, 16), parseInt(mapped[2]!, 16)];
    ip = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  } else {
    ip = ip.replace(/^::ffff:/, "");
  }
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0, c = 0] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  return (
    ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip) ||
    // Adresses IPv4 compatibles (::7f00:1) et préfixe NAT64 : elles peuvent viser un hôte interne.
    /^::[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(ip) || ip.startsWith("64:ff9b:")
  );
}

export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("invalid_url");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new AppError("invalid_url");
  if (url.port && !["80", "443"].includes(url.port)) throw new AppError("invalid_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new AppError("invalid_url");
  if (net.isIP(host) && isPrivateAddress(host)) throw new AppError("invalid_url");
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** Résolution vérifiée à la connexion même : ferme la porte au « DNS rebinding ». */
function safeLookup(hostname: string, options: LookupOneOptions | LookupAllOptions, callback: LookupCallback) {
  lookup(hostname, { ...options, all: true } as LookupAllOptions, (err, addresses) => {
    if (err) return callback(err, "");
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error("blocked"), { code: "EBLOCKED" }), "");
    }
    if ((options as LookupAllOptions).all) return callback(null, addresses);
    const first = addresses[0]!;
    callback(null, first.address, first.family);
  });
}

function requestOnce(url: URL, maxBytes: number, timeoutMs: number): Promise<{ status: number; location?: string; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: safeLookup as typeof lookup,
        timeout: timeoutMs,
        headers: { "User-Agent": "PostPilotBot/1.0", Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            resolve({ status: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) });
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            contentType: String(res.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetchHtml(rawUrl: string, { maxBytes = 2_000_000, timeoutMs = 8000, maxRedirects = 3 } = {}): Promise<{ url: string; html: string }> {
  let url = assertPublicUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let response;
    try {
      response = await requestOnce(url, maxBytes, timeoutMs);
    } catch {
      throw new AppError("website_unreachable");
    }
    if (response.status >= 300 && response.status < 400 && response.location) {
      url = assertPublicUrl(new URL(response.location, url).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new AppError("website_unreachable");
    if (!/html|text\/plain/i.test(response.contentType)) throw new AppError("website_unreachable");
    return { url: url.toString(), html: response.body.toString("utf8") };
  }
  throw new AppError("website_unreachable");
}
