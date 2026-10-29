import "./globals.css";
import "@fontsource-variable/onest";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "PackApprove — QAZALPACK",
  description: "Платформа согласования дизайна упаковки ТОО QAZALPACK",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
