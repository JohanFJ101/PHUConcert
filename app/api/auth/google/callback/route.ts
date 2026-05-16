/**
 * GET /api/auth/google/callback
 *
 * Completes attendee Google OAuth. A successful Google profile must match
 * an attendee email that was preloaded through the admin CSV import.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  attendeeLoginRedirect,
  clearGoogleOAuthStateCookie,
  getBrowserBaseUrl,
  getGoogleOAuthConfig
} from "@/lib/google-oauth";
import { isGmailAddress, normalizeAttendeeEmail, normalizeEmailAddress } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleUserInfoResponse = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
};

function loginRedirectWithClearedState(request: NextRequest, errorCode: string) {
  const response = attendeeLoginRedirect(request, errorCode);
  clearGoogleOAuthStateCookie(response);
  return response;
}

async function findImportedAttendeeForOAuthEmail(email: string) {
  const rawEmail = normalizeEmailAddress(email);
  const attendeeEmail = normalizeAttendeeEmail(email);
  const exactEmailCandidates = Array.from(new Set([rawEmail, attendeeEmail]));

  const emailFilters =
    isGmailAddress(email)
      ? [
          {
            email: {
              in: exactEmailCandidates
            }
          },
          {
            email: {
              endsWith: "@gmail.com"
            }
          },
          {
            email: {
              endsWith: "@googlemail.com"
            }
          }
        ]
      : [
          {
            email: {
              in: exactEmailCandidates
            }
          }
        ];

  const candidates = await prisma.user.findMany({
    where: {
      OR: emailFilters
    },
    select: {
      id: true,
      email: true,
      googleSub: true
    }
  });

  const matchingAttendees = candidates.filter(
    (candidate) => normalizeAttendeeEmail(candidate.email) === attendeeEmail
  );
  const uniqueAttendees = Array.from(
    new Map(matchingAttendees.map((candidate) => [candidate.id, candidate])).values()
  );

  if (uniqueAttendees.length > 1) {
    return {
      attendee: null,
      errorCode: "oauth_email_ambiguous"
    };
  }

  return {
    attendee: uniqueAttendees[0] ?? null,
    errorCode: null
  };
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return loginRedirectWithClearedState(request, "oauth_denied");
  }

  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return loginRedirectWithClearedState(request, "oauth_state_invalid");
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return loginRedirectWithClearedState(request, "oauth_missing_code");
  }

  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig(request);
  if (!clientId || !clientSecret) {
    return loginRedirectWithClearedState(request, "oauth_not_configured");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    if (!tokenResponse.ok) {
      return loginRedirectWithClearedState(request, "oauth_exchange_failed");
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenData.access_token) {
      return loginRedirectWithClearedState(request, "oauth_exchange_failed");
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    if (!profileResponse.ok) {
      return loginRedirectWithClearedState(request, "oauth_profile_failed");
    }

    const profile = (await profileResponse.json()) as GoogleUserInfoResponse;
    if (
      typeof profile.sub !== "string" ||
      typeof profile.email !== "string" ||
      profile.email_verified === false
    ) {
      return loginRedirectWithClearedState(request, "oauth_profile_invalid");
    }

    const { attendee, errorCode } = await findImportedAttendeeForOAuthEmail(profile.email);
    if (errorCode) {
      return loginRedirectWithClearedState(request, errorCode);
    }

    if (!attendee) {
      return loginRedirectWithClearedState(request, "attendee_not_imported");
    }

    if (attendee.googleSub && attendee.googleSub !== profile.sub) {
      return loginRedirectWithClearedState(request, "oauth_account_mismatch");
    }

    const userWithGoogleSub = await prisma.user.findUnique({
      where: {
        googleSub: profile.sub
      },
      select: {
        id: true
      }
    });

    if (userWithGoogleSub && userWithGoogleSub.id !== attendee.id) {
      return loginRedirectWithClearedState(request, "oauth_account_linked");
    }

    const user = await prisma.user.update({
      where: {
        id: attendee.id
      },
      data: {
        googleSub: profile.sub
      },
      select: {
        id: true
      }
    });

    const response = NextResponse.redirect(
      new URL("/attendee/dashboard", getBrowserBaseUrl(request))
    );
    clearGoogleOAuthStateCookie(response);
    setSessionCookie(response, {
      role: "ATTENDEE",
      userId: user.id
    });
    return response;
  } catch {
    return loginRedirectWithClearedState(request, "oauth_failed");
  }
}
