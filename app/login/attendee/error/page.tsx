import Link from "next/link";

type ErrorContent = {
  title: string;
  body: string;
  detail: string;
};

const ERROR_CONTENT: Record<string, ErrorContent> = {
  attendee_not_imported: {
    title: "Ticket not found",
    body: "The Google account you used is not in the list of registered attendees.",
    detail:
      "Ask an admin to import the BookMyShow CSV, or sign in with the same email used for registration."
  },
  oauth_account_linked: {
    title: "Google account already linked",
    body: "This Google account is already linked to another attendee.",
    detail: "Use the Google account that matches your ticket registration email."
  },
  oauth_account_mismatch: {
    title: "Different Google account required",
    body: "This attendee is already linked to a different Google account.",
    detail: "Sign in with the account previously used for this ticket."
  },
  oauth_email_ambiguous: {
    title: "Email match is ambiguous",
    body: "More than one imported attendee matches this Google email after Gmail dot normalization.",
    detail: "Ask an admin to remove the duplicate attendee row, then try signing in again."
  },
  oauth_not_configured: {
    title: "OAuth is not configured",
    body: "Google OAuth credentials are missing on this server.",
    detail: "Set the Google OAuth client id and secret in the environment file."
  }
};

const DEFAULT_ERROR_CONTENT: ErrorContent = {
  title: "Sign-in failed",
  body: "Google sign-in could not be completed.",
  detail: "Return to attendee login and try again."
};

type AttendeeLoginErrorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function AttendeeLoginErrorPage({
  searchParams
}: AttendeeLoginErrorPageProps) {
  const params = await searchParams;
  const reason = firstParam(params.reason ?? params.error);
  const content = ERROR_CONTENT[reason] ?? DEFAULT_ERROR_CONTENT;

  return (
    <main className="role-page role-attendee">
      <section className="error-card">
        <div className="error-icon" aria-hidden="true">
          !
        </div>
        <div className="stack">
          <div>
            <p className="muted">Attendee OAuth</p>
            <h1>{content.title}</h1>
          </div>
          <p>{content.body}</p>
          <div className="role-hint">{content.detail}</div>
          <div className="row">
            <Link className="button-link" href="/login/attendee">
              Back to attendee login
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
