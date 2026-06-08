export const metadata = {
  title: "Sepia IG Automation",
  description: "Instagram DM automation + publishing for Sepia Software",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
