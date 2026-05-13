/**
 * `/` - Root page.
 *
 * There is no public landing page yet; every flow starts at the role
 * chooser. Server-side redirect (rather than a client-side `useEffect`)
 * means even crawlers and curl requests land on the login picker.
 */

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/login");
}
