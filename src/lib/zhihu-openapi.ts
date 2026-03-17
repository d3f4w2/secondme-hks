import { createHmac, randomUUID } from "node:crypto";

const DEFAULT_ZHIHU_OPENAPI_BASE_URL = "https://openapi.zhihu.com";

type ZhihuEnvelope<T> = {
  status?: number;
  code?: number;
  msg?: string;
  data?: T | null;
  error?: {
    code?: number;
    name?: string;
    message?: string;
  };
  message?: string;
};

type ZhihuRequestOptions = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

function readOptionalEnv(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function zhihuBaseUrl() {
  return readOptionalEnv("ZHIHU_OPENAPI_BASE_URL") ?? DEFAULT_ZHIHU_OPENAPI_BASE_URL;
}

function zhihuAppKey() {
  return readOptionalEnv("ZHIHU_OPENAPI_AK");
}

function zhihuAppSecret() {
  return readOptionalEnv("ZHIHU_OPENAPI_SK");
}

function zhihuExtraInfo() {
  return readOptionalEnv("ZHIHU_OPENAPI_EXTRA_INFO") ?? "";
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

function buildDebugHeader() {
  const headerName = readOptionalEnv("ZHIHU_OPENAPI_AUTH_HEADER");
  const headerValue = readOptionalEnv("ZHIHU_OPENAPI_AUTH_VALUE");

  if (!headerName || !headerValue) {
    return null;
  }

  return {
    [headerName]: headerValue,
  };
}

function buildSignedHeaders() {
  const appKey = zhihuAppKey();
  const appSecret = zhihuAppSecret();

  if (!appKey || !appSecret) {
    throw new Error("Zhihu OpenAPI app_key/app_secret is not configured");
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const logId = `log_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const extraInfo = zhihuExtraInfo();
  const signString = `app_key:${appKey}|ts:${timestamp}|logid:${logId}|extra_info:${extraInfo}`;
  const sign = createHmac("sha256", appSecret).update(signString).digest("base64");

  return {
    "X-App-Key": appKey,
    "X-Timestamp": timestamp,
    "X-Log-Id": logId,
    "X-Extra-Info": extraInfo,
    "X-Sign": sign,
  };
}

async function parseZhihuResponse<T>(response: Response) {
  let payload: ZhihuEnvelope<T>;

  try {
    payload = (await response.json()) as ZhihuEnvelope<T>;
  } catch {
    throw new Error(`Zhihu OpenAPI failed with ${response.status}`);
  }

  const apiFailed =
    !response.ok ||
    payload.status === 1 ||
    payload.code === 1 ||
    payload.error;

  if (apiFailed) {
    const message =
      payload.error?.message ||
      payload.msg ||
      payload.message ||
      `Zhihu OpenAPI failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
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
      ...buildSignedHeaders(),
      ...(buildDebugHeader() ?? {}),
    },
    body: body ? bodyString : undefined,
    cache: "no-store",
  });

  return parseZhihuResponse<T>(response);
}

export async function fetchBillboardList(topCount = 50, publishInHours = 48) {
  return requestZhihuOpenApi<{
    list?: Record<string, unknown>[];
    pagination?: Record<string, unknown>;
  }>({
    method: "GET",
    path: "/openapi/billboard/list",
    query: {
      top_cnt: topCount,
      publish_in_hours: publishInHours,
    },
  });
}

export async function searchGlobal(query: string, count = 10) {
  return requestZhihuOpenApi<{
    has_more?: boolean;
    items?: Record<string, unknown>[];
  }>({
    method: "GET",
    path: "/openapi/search/global",
    query: {
      query,
      count,
    },
  });
}

export async function getRingDetail(ringId: string, pageNum = 1, pageSize = 20) {
  return requestZhihuOpenApi<Record<string, unknown>>({
    method: "GET",
    path: "/openapi/ring/detail",
    query: {
      ring_id: ringId,
      page_num: pageNum,
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

export async function deleteComment(payload: Record<string, unknown>) {
  return requestZhihuOpenApi<Record<string, unknown>>({
    method: "POST",
    path: "/openapi/comment/delete",
    body: payload,
  });
}

export async function listComments(contentType: string, contentToken: string, pageNum = 1, pageSize = 20) {
  return requestZhihuOpenApi<Record<string, unknown>>({
    method: "GET",
    path: "/openapi/comment/list",
    query: {
      content_type: contentType,
      content_token: contentToken,
      page_num: pageNum,
      page_size: pageSize,
    },
  });
}
