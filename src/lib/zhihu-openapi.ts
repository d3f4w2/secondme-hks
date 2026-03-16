import { createHmac, createHash, randomUUID } from "node:crypto";

const DEFAULT_ZHIHU_OPENAPI_BASE_URL = "https://openapi.zhihu.com";

export type ZhihuBillboardItem = Record<string, unknown>;

type ZhihuRequestOptions = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

function zhihuBaseUrl() {
  return process.env.ZHIHU_OPENAPI_BASE_URL ?? DEFAULT_ZHIHU_OPENAPI_BASE_URL;
}

function buildQueryString(query?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  return params.toString();
}

function buildStaticAuthHeaders() {
  const headerName = process.env.ZHIHU_OPENAPI_AUTH_HEADER;
  const headerValue = process.env.ZHIHU_OPENAPI_AUTH_VALUE;

  if (!headerName || !headerValue) {
    return null;
  }

  return {
    [headerName]: headerValue,
  };
}

function buildRawHmacHeaders(options: {
  method: string;
  path: string;
  queryString: string;
  bodyString: string;
}) {
  const ak = process.env.ZHIHU_OPENAPI_AK;
  const sk = process.env.ZHIHU_OPENAPI_SK;
  const signMode = process.env.ZHIHU_OPENAPI_SIGN_MODE;

  if (!ak || !sk || signMode !== "raw_hmac_sha256") {
    return null;
  }

  // This is an opt-in provisional signer until the official Zhihu
  // canonical-signature spec from the hackathon doc is available locally.
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const canonical = [
    options.method.toUpperCase(),
    options.path,
    options.queryString,
    timestamp,
    nonce,
    createHash("sha256").update(options.bodyString).digest("hex"),
  ].join("\n");
  const signature = createHmac("sha256", sk).update(canonical).digest("hex");

  return {
    "X-Zhihu-AK": ak,
    "X-Zhihu-Timestamp": timestamp,
    "X-Zhihu-Nonce": nonce,
    "X-Zhihu-Signature": signature,
  };
}

function buildAuthHeaders(options: {
  method: string;
  path: string;
  queryString: string;
  bodyString: string;
}) {
  const staticHeaders = buildStaticAuthHeaders();

  if (staticHeaders) {
    return staticHeaders;
  }

  const rawHmacHeaders = buildRawHmacHeaders(options);

  if (rawHmacHeaders) {
    return rawHmacHeaders;
  }

  throw new Error("Zhihu OpenAPI auth is not configured");
}

export async function requestZhihuOpenApi<T>({
  method,
  path,
  query,
  body,
}: ZhihuRequestOptions) {
  const queryString = buildQueryString(query);
  const bodyString = body ? JSON.stringify(body) : "";
  const url = `${zhihuBaseUrl()}${path}${queryString ? `?${queryString}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...buildAuthHeaders({
        method,
        path,
        queryString,
        bodyString,
      }),
    },
    body: body ? bodyString : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Zhihu OpenAPI failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchBillboardList(hours = 12) {
  return requestZhihuOpenApi<{ data?: ZhihuBillboardItem[]; list?: ZhihuBillboardItem[] }>({
    method: "GET",
    path: "/openapi/billboard/list",
    query: {
      hours,
    },
  });
}

export async function searchGlobal(keyword: string, page = 1, pageSize = 10) {
  return requestZhihuOpenApi<Record<string, unknown>>({
    method: "GET",
    path: "/openapi/search/global",
    query: {
      keyword,
      page,
      page_size: pageSize,
    },
  });
}

export async function getRingDetail(ringId: string, page = 1, pageSize = 20) {
  return requestZhihuOpenApi<Record<string, unknown>>({
    method: "GET",
    path: "/openapi/ring/detail",
    query: {
      ring_id: ringId,
      page,
      page_size: pageSize,
    },
  });
}

export async function publishPin(payload: Record<string, unknown>) {
  return requestZhihuOpenApi<Record<string, unknown>>({
    method: "POST",
    path: "/openapi/publish/pin",
    body: payload,
  });
}

export async function reactToEntity(payload: Record<string, unknown>) {
  return requestZhihuOpenApi<Record<string, unknown>>({
    method: "POST",
    path: "/openapi/reaction",
    body: payload,
  });
}

export async function createComment(payload: Record<string, unknown>) {
  return requestZhihuOpenApi<Record<string, unknown>>({
    method: "POST",
    path: "/openapi/comment/create",
    body: payload,
  });
}

export async function listComments(targetId: string, page = 1, pageSize = 20) {
  return requestZhihuOpenApi<Record<string, unknown>>({
    method: "GET",
    path: "/openapi/comment/list",
    query: {
      target_id: targetId,
      page,
      page_size: pageSize,
    },
  });
}
