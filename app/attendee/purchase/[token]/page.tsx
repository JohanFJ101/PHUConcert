/**
 * Server wrapper for the attendee purchase approval page. Dynamic route
 * params are resolved here and passed to the client component.
 */

import PurchaseReviewClient from "./PurchaseReviewClient";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function AttendeePurchasePage({ params }: PageProps) {
  const { token } = await params;

  return <PurchaseReviewClient token={token} />;
}
