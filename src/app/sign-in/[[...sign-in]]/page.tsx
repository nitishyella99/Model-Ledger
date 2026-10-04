import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthPage, authAppearance } from "@/components/layout/auth-page";
import type { Metadata } from "next";
import { SIGNED_IN_HOME } from "@/lib/public-routes";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: true } };

export default async function SignInPage() {
  if ((await auth()).userId) redirect(SIGNED_IN_HOME);
  return <AuthPage><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" appearance={authAppearance} /></AuthPage>;
}
