import { NextRequest, NextResponse } from "next/server";

export const GOOGLE_OAUTH_STATE_COOKIE = "phu_google_oauth_state";

function normalizeBrowserHost(url: URL) {
  if (url.hostname === "0.0.0.0" || url.hostname === "::" || url.hostname === "[::]") {
    url.hostname = "localhost";
  }

  return url;
}

function normalizeBrowserBaseUrl(url: URL) {
  normalizeBrowserHost(url);

  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function getBrowserBaseUrl(request: NextRequest) {
  const configuredBaseUrl =
    process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "";
  if (configuredBaseUrl) {
    return normalizeBrowserBaseUrl(new URL(configuredBaseUrl));
  }

  return normalizeBrowserBaseUrl(new URL(request.nextUrl.origin));
}

function getOAuthRedirectUri(request: NextRequest) {
  const configuredRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "";
  if (configuredRedirectUri) {
    return normalizeBrowserHost(new URL(configuredRedirectUri)).toString();
  }

  return new URL("/api/auth/google/callback", getBrowserBaseUrl(request)).toString();
}

export function getGoogleOAuthConfig(request: NextRequest) {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirectUri: getOAuthRedirectUri(request)
  };
}

export function attendeeLoginRedirect(request: NextRequest, errorCode: string) {
  const redirectUrl = new URL("/login/attendee/error", getBrowserBaseUrl(request));
  redirectUrl.searchParams.set("reason", errorCode);
  return NextResponse.redirect(redirectUrl);
}

export function clearGoogleOAuthStateCookie(response: NextResponse) {
  response.cookies.set({
    name: GOOGLE_OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
