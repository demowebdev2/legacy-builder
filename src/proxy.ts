import { convexAuthNextjsMiddleware, createRouteMatcher, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";

/**
 * Next.js 16 proxy (formerly middleware). Handles Convex Auth cookies and token refresh, and sends
 * signed-out visitors away from the portals. This is a UX guard only — every Convex function enforces
 * authentication and authorisation itself.
 */
const isPortal = createRouteMatcher(["/agent(.*)", "/admin(.*)", "/apply/pending(.*)"]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    if (isPortal(request) && !(await convexAuth.isAuthenticated())) {
      const next = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
      return nextjsMiddlewareRedirect(request, `/auth/login?next=${next}`);
    }
  },
  { cookieConfig: { maxAge: 60 * 60 * 24 * 30 } },
);

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
