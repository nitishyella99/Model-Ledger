export const SIGNED_IN_HOME = "/dashboard";

export const retiredPublicRoutes = [
  "/",
  "/pricing",
  "/what-it-solves",
  "/how-to-use",
  "/faq",
  "/privacy",
  "/terms",
];

export function isAuthPage(pathname: string) {
  return /^\/sign-(in|up)(\/|$)/.test(pathname);
}

export function isPublicPage(pathname: string) {
  return pathname === "/" || isAuthPage(pathname);
}

export type RouteAccess = "public" | "workspace" | "sign-in" | "dashboard" | "unauthorized";

export function getRouteAccess(pathname: string, signedIn: boolean): RouteAccess {
  if (retiredPublicRoutes.includes(pathname.replace(/\/$/, "") || "/")) {
    return signedIn ? "dashboard" : "sign-in";
  }
  if (isPublicPage(pathname)) {
    if (signedIn && (pathname === "/" || isAuthPage(pathname))) return "dashboard";
    return "public";
  }

  if (signedIn) return "workspace";
  if (/^\/(api|trpc)(\/|$)/.test(pathname) || /^\/reports\/.+\/export\/?$/.test(pathname)) {
    return "unauthorized";
  }
  // New routes require authentication unless deliberately added to the public list.
  return "sign-in";
}
