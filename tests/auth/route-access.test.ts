import { test } from "node:test";
import assert from "node:assert/strict";
import { getRouteAccess, retiredPublicRoutes } from "../../src/lib/public-routes";

test("visitors can open account and nested Clerk recovery routes", () => {
  for (const path of ["/sign-in", "/sign-up", "/sign-in/factor-one", "/sign-up/verify-email-address"]) {
    assert.equal(getRouteAccess(path, false), "public", path);
  }
});

test("signed-in users enter the dashboard from home and account pages", () => {
  for (const path of ["/", "/sign-in", "/sign-up", "/sign-in/factor-one"]) {
    assert.equal(getRouteAccess(path, true), "dashboard", path);
  }
});

test("home and retired marketing URLs lead to login or the dashboard", () => {
  for (const path of retiredPublicRoutes) {
    for (const url of [path, path === "/" ? path : `${path}/`]) {
      assert.equal(getRouteAccess(url, false), "sign-in", url);
      assert.equal(getRouteAccess(url, true), "dashboard", url);
    }
  }
});

test("workspace pages and unlisted routes require login", () => {
  for (const path of ["/dashboard", "/projects", "/projects/example/tests", "/reports/example", "/pricing/private", "/sign-in-spoof", "/new-feature"]) {
    assert.equal(getRouteAccess(path, false), "sign-in", path);
    assert.equal(getRouteAccess(path, true), "workspace", path);
  }
});

test("API, RPC, and report exports reject anonymous requests without HTML redirects", () => {
  for (const path of ["/api", "/api/onboarding", "/api/onboarding/example", "/trpc/query", "/reports/example/export", "/reports/example/export/"]) {
    assert.equal(getRouteAccess(path, false), "unauthorized", path);
    assert.equal(getRouteAccess(path, true), "workspace", path);
  }
  assert.equal(getRouteAccess("/api-spoof", false), "sign-in");
});
