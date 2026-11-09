import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { publicEnv } from "@/lib/env";
import { SocialApiError, type ConnectCandidate, type PublishRequest, type PublishResult, type SocialConnector } from "./types";

export const metaConfigured = () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);

const version = () => process.env.META_GRAPH_VERSION || "v24.0";
const graphUrl = (path: string) => `https://graph.facebook.com/${version()}/${path}`;

export const META_REDIRECT_PATH = "/api/oauth/meta/callback";
export const metaRedirectUri = () => `${publicEnv.appUrl}${META_REDIRECT_PATH}`;

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };

async function graph<T>(path: string, init?: { params?: Record<string, string>; method?: "GET" | "POST" | "DELETE" }): Promise<T> {
  const method = init?.method ?? "GET";
  const params = new URLSearchParams(init?.params);
  const url = method === "GET" ? `${graphUrl(path)}?${params}` : graphUrl(path);
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(method === "GET" ? {} : { body: params, headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
  });
  const body = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok || body.error) {
    const code = body.error?.code;
    throw new SocialApiError(body.error?.message ?? `HTTP ${response.status}`, code === 190 || code === 102);
  }
  return body;
}

export function metaAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: metaRedirectUri(),
    state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  return `https://www.facebook.com/${version()}/dialog/oauth?${params}`;
}

export type MetaTokenBundle = {
  providerUserId: string;
  userToken: string;
  userTokenExpiresAt: string | null;
  pageTokens: Record<string, string>;
};

function expiryFrom(seconds?: number): string | null {
  return seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;
}

async function exchangeForLongLived(token: string) {
  return graph<{ access_token: string; expires_in?: number }>("oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID ?? "",
      client_secret: process.env.META_APP_SECRET ?? "",
      fb_exchange_token: token,
    },
  });
}

type AccountsResponse = {
  data: {
    id: string;
    name: string;
    access_token: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
  }[];
};

/** Échange le code OAuth contre un jeton longue durée et liste les Pages et comptes Instagram. */
export async function metaCompleteOAuth(code: string): Promise<{ candidates: ConnectCandidate[]; tokens: MetaTokenBundle }> {
  const short = await graph<{ access_token: string }>("oauth/access_token", {
    params: {
      client_id: process.env.META_APP_ID ?? "",
      client_secret: process.env.META_APP_SECRET ?? "",
      redirect_uri: metaRedirectUri(),
      code,
    },
  });
  const long = await exchangeForLongLived(short.access_token);
  const me = await graph<{ id: string }>("me", { params: { fields: "id", access_token: long.access_token } });
  const accounts = await graph<AccountsResponse>("me/accounts", {
    params: {
      fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
      limit: "100",
      access_token: long.access_token,
    },
  });

  const candidates: ConnectCandidate[] = [];
  const pageTokens: Record<string, string> = {};

  for (const page of accounts.data) {
    pageTokens[`facebook:${page.id}`] = page.access_token;
    candidates.push({
      key: `facebook:${page.id}`,
      network: "facebook",
      externalId: page.id,
      displayName: page.name,
      username: null,
      avatarUrl: page.picture?.data?.url ?? null,
    });
    const ig = page.instagram_business_account;
    if (ig) {
      // La publication Instagram utilise le jeton de la Page liée.
      pageTokens[`instagram:${ig.id}`] = page.access_token;
      candidates.push({
        key: `instagram:${ig.id}`,
        network: "instagram",
        externalId: ig.id,
        displayName: ig.username ?? page.name,
        username: ig.username ?? null,
        avatarUrl: ig.profile_picture_url ?? null,
      });
    }
  }

  return {
    candidates,
    tokens: { providerUserId: me.id, userToken: long.access_token, userTokenExpiresAt: expiryFrom(long.expires_in), pageTokens },
  };
}

export type MetaTokenHealth = { valid: boolean; expiresAt: string | null; scopes: string[] };

export async function metaInspectToken(token: string): Promise<MetaTokenHealth> {
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const { data } = await graph<{ data: { is_valid: boolean; expires_at?: number; scopes?: string[] } }>("debug_token", {
    params: { input_token: token, access_token: appToken },
  });
  return {
    valid: data.is_valid,
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : null,
    scopes: data.scopes ?? [],
  };
}

/** Renouvelle le jeton utilisateur, puis relit le jeton de la Page qui en dépend. */
export async function metaRefreshTokens(userToken: string, network: string, externalId: string) {
  const long = await exchangeForLongLived(userToken);
  const accounts = await graph<AccountsResponse>("me/accounts", {
    params: { fields: "id,access_token,instagram_business_account{id}", limit: "100", access_token: long.access_token },
  });
  const page = accounts.data.find((p) => (network === "instagram" ? p.instagram_business_account?.id === externalId : p.id === externalId));
  if (!page) throw new SocialApiError("account_not_found", true);
  return { userToken: long.access_token, userTokenExpiresAt: expiryFrom(long.expires_in), accessToken: page.access_token };
}

/** Vérifie la signature d'un `signed_request` envoyé par Meta. Renvoie l'utilisateur, ou null. */
export function metaParseSignedRequest(signedRequest: string, secret: string): { user_id?: string } | null {
  const [encodedSig, payload] = signedRequest.split(".");
  if (!encodedSig || !payload) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(encodedSig, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string };
  } catch {
    return null;
  }
}

export const facebookConnector: SocialConnector = {
  network: "facebook",

  async publish({ externalId, accessToken, caption, imageUrls }: PublishRequest): Promise<PublishResult> {
    if (imageUrls.length === 0) {
      const { id } = await graph<{ id: string }>(`${externalId}/feed`, { method: "POST", params: { message: caption, access_token: accessToken } });
      return { externalPostId: id, url: `https://www.facebook.com/${id}` };
    }
    if (imageUrls.length === 1) {
      const res = await graph<{ id: string; post_id?: string }>(`${externalId}/photos`, {
        method: "POST",
        params: { url: imageUrls[0]!, caption, access_token: accessToken },
      });
      const id = res.post_id ?? res.id;
      return { externalPostId: id, url: `https://www.facebook.com/${id}` };
    }
    const media = await Promise.all(
      imageUrls.map((url) =>
        graph<{ id: string }>(`${externalId}/photos`, { method: "POST", params: { url, published: "false", access_token: accessToken } }),
      ),
    );
    const params: Record<string, string> = { message: caption, access_token: accessToken };
    media.forEach((m, i) => {
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: m.id });
    });
    const { id } = await graph<{ id: string }>(`${externalId}/feed`, { method: "POST", params });
    return { externalPostId: id, url: `https://www.facebook.com/${id}` };
  },

  async recentPosts(externalId, accessToken, limit) {
    const { data } = await graph<{ data: { message?: string }[] }>(`${externalId}/posts`, {
      params: { fields: "message", limit: String(limit), access_token: accessToken },
    });
    return data.map((p) => p.message ?? "").filter(Boolean);
  },
};

async function waitForContainer(containerId: string, accessToken: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { status_code } = await graph<{ status_code?: string }>(containerId, { params: { fields: "status_code", access_token: accessToken } });
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new SocialApiError(`container_${status_code}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new SocialApiError("container_timeout");
}

export const instagramConnector: SocialConnector = {
  network: "instagram",

  async publish({ externalId, accessToken, caption, imageUrls }: PublishRequest): Promise<PublishResult> {
    if (!imageUrls.length) throw new SocialApiError("instagram_requires_media");

    let containerId: string;
    if (imageUrls.length === 1) {
      ({ id: containerId } = await graph<{ id: string }>(`${externalId}/media`, {
        method: "POST",
        params: { image_url: imageUrls[0]!, caption, access_token: accessToken },
      }));
    } else {
      const children = await Promise.all(
        imageUrls.map((image_url) =>
          graph<{ id: string }>(`${externalId}/media`, { method: "POST", params: { image_url, is_carousel_item: "true", access_token: accessToken } }),
        ),
      );
      await Promise.all(children.map((child) => waitForContainer(child.id, accessToken)));
      ({ id: containerId } = await graph<{ id: string }>(`${externalId}/media`, {
        method: "POST",
        params: { media_type: "CAROUSEL", caption, children: children.map((c) => c.id).join(","), access_token: accessToken },
      }));
    }

    await waitForContainer(containerId, accessToken);
    const { id } = await graph<{ id: string }>(`${externalId}/media_publish`, {
      method: "POST",
      params: { creation_id: containerId, access_token: accessToken },
    });
    const { permalink } = await graph<{ permalink?: string }>(id, { params: { fields: "permalink", access_token: accessToken } });
    return { externalPostId: id, url: permalink ?? null };
  },

  async recentPosts(externalId, accessToken, limit) {
    const { data } = await graph<{ data: { caption?: string }[] }>(`${externalId}/media`, {
      params: { fields: "caption", limit: String(limit), access_token: accessToken },
    });
    return data.map((p) => p.caption ?? "").filter(Boolean);
  },
};
