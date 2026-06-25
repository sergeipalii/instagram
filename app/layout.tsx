import "./globals.css";

export const metadata = {
  title: "Sepia Inbox",
  description: "Semi-automatic Instagram inbox — DMs + comments",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
