const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function readOptionalEnv(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function getAppBaseUrl() {
  return trimTrailingSlash(readOptionalEnv("APP_BASE_URL") ?? DEFAULT_APP_BASE_URL);
}

export function getSecondMeRedirectUri() {
  return trimTrailingSlash(
    readOptionalEnv("SECONDME_REDIRECT_URI") ?? `${getAppBaseUrl()}/api/auth/callback`,
  );
}

export function getMetadataBase() {
  try {
    return new URL(getAppBaseUrl());
  } catch {
    return undefined;
  }
}
