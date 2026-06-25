import dns from "node:dns";
import net from "node:net";

/**
 * Some networks can't reach Neon's IPv6 addresses and drop the parallel
 * Happy-Eyeballs SYNs, so Node's fetch (undici) times out connecting to the
 * HTTPS SQL endpoint while curl -4 succeeds. Forcing IPv4-first + sequential
 * connects fixes it. Skipped on Vercel, where the default path works fine.
 */
export function forceIpv4(): void {
  if (process.env.VERCEL) return;
  try {
    dns.setDefaultResultOrder("ipv4first");
    net.setDefaultAutoSelectFamily(false);
  } catch {
    // older/edge runtimes without these APIs — ignore
  }
}
