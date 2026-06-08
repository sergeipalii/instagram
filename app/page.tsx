export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 40, maxWidth: 640 }}>
      <h1>Sepia IG Automation</h1>
      <p>Service is running. This deployment handles:</p>
      <ul>
        <li>
          <code>POST /api/webhook</code> — incoming Instagram DMs → Claude reply
        </li>
        <li>
          <code>GET /api/token</code> — current IG token for the local publisher
          (secret-protected)
        </li>
        <li>
          <code>GET /api/cron/refresh-token</code> — token refresh (Vercel Cron)
        </li>
      </ul>
    </main>
  );
}
