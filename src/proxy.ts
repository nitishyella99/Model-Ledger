import { clerkMiddleware } from "@clerk/nextjs/server";
import { getRouteAccess, isAuthPage, isPublicPage, SIGNED_IN_HOME } from "@/lib/public-routes";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const clerkProxy = clerkMiddleware(async (auth, request) => {
  const { userId, redirectToSignIn } = await auth();
  const access = getRouteAccess(request.nextUrl.pathname, Boolean(userId));

  switch (access) {
    case "dashboard":
      return NextResponse.redirect(new URL(SIGNED_IN_HOME, request.url));
    case "sign-in":
      return redirectToSignIn({ returnBackUrl: request.url });
    case "unauthorized":
      return NextResponse.json(
        { error: "Sign in to continue." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    case "workspace":
      await auth.protect();
      break;
    case "public":
      break;
  }

  const requestHeaders = new Headers(request.headers);
  // Always overwrite client input: AppShell uses this only to choose its layout.
  requestHeaders.set("x-modelledger-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    !process.env.CLERK_SECRET_KEY
  ) {
    if (isPublicPage(request.nextUrl.pathname) && !isAuthPage(request.nextUrl.pathname)) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-modelledger-path", request.nextUrl.pathname);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.json(
      { error: "Authentication is not configured." },
      { status: 503 },
    );
  }
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/reports/(.*)/export",
  ],
};
