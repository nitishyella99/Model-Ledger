import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthPage, authAppearance } from "@/components/layout/auth-page";
import type { Metadata } from "next";
import { SIGNED_IN_HOME } from "@/lib/public-routes";

export const metadata: Metadata = { title: "Create your account", robots: { index: false, follow: true } };

export default async function SignUpPage() {
  if ((await auth()).userId) redirect(SIGNED_IN_HOME);
  return <AuthPage><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" appearance={authAppearance} /></AuthPage>;
}
