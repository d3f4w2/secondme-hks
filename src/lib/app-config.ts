const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getAppBaseUrl() {
  return trimTrailingSlash(process.env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL);
}

export function getSecondMeRedirectUri() {
  return trimTrailingSlash(
    process.env.SECONDME_REDIRECT_URI ?? `${getAppBaseUrl()}/api/auth/callback`,
  );
}

export function getMetadataBase() {
  try {
    return new URL(getAppBaseUrl());
  } catch {
    return undefined;
  }
}
