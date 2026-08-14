import type { NextConfig } from "next";

// Автоадрес, который Vercel выдал проекту при создании. Он живой и отдаёт то
// же приложение, что и собственный домен, — то есть инбокс существует в двух
// экземплярах под разными именами.
const VERCEL_AUTO_HOST = "instagram-sigma-sepia.vercel.app";
const CANONICAL_HOST = "inbox.sepia.software";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // Всё, кроме /api. Машинные вызовы — вебхук Meta и выдача токена —
        // должны отвечать по обоим именам: Meta редиректы на вебхуках не
        // гарантирует, а проверить, какой адрес стоит у неё в Callback URL,
        // из репозитория нельзя (app id локально не хранится). Исключение
        // делает переключение неспособным сломать доставку событий.
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: VERCEL_AUTO_HOST }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
