import { forceIpv4 } from "@/lib/net-ipv4";

// Runs once at server startup (Next.js instrumentation hook).
export async function register() {
  forceIpv4();
}
