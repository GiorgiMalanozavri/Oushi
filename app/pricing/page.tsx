import type { Metadata } from "next";
import { PricingClient } from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing · Oushi",
  description:
    "Oushi is free during beta. Pro unlocks unlimited Ask Oushi, unlimited topic boards, and auto-drafted replies in your voice for $15/mo.",
};

export default function PricingPage() {
  return <PricingClient />;
}
