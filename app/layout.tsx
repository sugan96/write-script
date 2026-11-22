import localFont from "next/font/local";
import "./globals.css";

// Script font, bundled so every writer sees and prints the same font.
// The editor reads it through the --font-script CSS variable.
const courierPrime = localFont({
  src: [
    { path: "./fonts/courier-prime-v11-latin-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/courier-prime-v11-latin-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/courier-prime-v11-latin-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/courier-prime-v11-latin-700italic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-script",
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={courierPrime.variable}>
      <body>{children}</body>
    </html>
  );
}
