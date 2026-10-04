import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { SIGNED_IN_HOME } from "@/lib/public-routes";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ModelLedger — Know what changed before you ship", template: "%s | ModelLedger" },
  description: "Test AI model versions, catch regressions, and keep the lessons from every evaluation in one place.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const document = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return document;
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl={SIGNED_IN_HOME}
      signUpFallbackRedirectUrl={SIGNED_IN_HOME}
      afterSignOutUrl="/"
    >
      {document}
    </ClerkProvider>
  );
}
