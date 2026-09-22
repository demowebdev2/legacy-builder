import { redirect } from "next/navigation";

/** Standalone public pricing is retired — pricing, volumes and lead quality terms are shown during the /apply flow. */
export default function PricingPage() {
  redirect("/for-agents");
}
