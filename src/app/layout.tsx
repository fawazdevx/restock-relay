import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restock Relay — Buy together. Stay in control.",
  description: "Neighborhood shops pool compatible restocks while keeping separate budgets, purchasing rules, and approvals.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
