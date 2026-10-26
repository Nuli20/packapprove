import "./globals.css";
import "./studio-refinements.css";
import "@fontsource-variable/onest";
export const metadata = {
  title: "PackApprove — QAZALPACK",
  description: "Платформа согласования дизайна упаковки ТОО QAZALPACK",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
