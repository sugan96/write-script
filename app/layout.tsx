import localFont from "next/font/local";
import { Inter } from "next/font/google";
import "./globals.css";

// App UI font (docs/0005-ui-components.md). Downloaded at build time and served with the app.
const inter = Inter({ subsets: ["latin"], variable: "--font-ui" });

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
    <html lang="en" className={`${courierPrime.variable} ${inter.variable}`}>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
