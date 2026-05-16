/**
 * GET /api/auth/google/start
 *
 * Starts attendee Google OAuth. The callback only signs in attendees who
 * already exist from the admin CSV import, so OAuth authenticates identity
 * without becoming open self-registration.
 */

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  attendeeLoginRedirect,
  getGoogleOAuthConfig,
  setGoogleOAuthStateCookie
} from "@/lib/google-oauth";

export async function GET(request: NextRequest) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig(request);
  if (!clientId || !clientSecret) {
    return attendeeLoginRedirect(request, "oauth_not_configured");
  }

  const state = randomBytes(32).toString("base64url");
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authorizationUrl);
  setGoogleOAuthStateCookie(response, state);
  return response;
}
