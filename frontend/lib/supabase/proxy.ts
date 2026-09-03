import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const configured = Boolean(supabaseUrl && publishableKey);
const previewAllowed =
  !configured || process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/dashboard";
}

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/mock/")
  );
}

function isPwaResource(pathname: string) {
  return (
    pathname === "/offline" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/service-worker.js"
  );
}

function redirectWithCookies(url: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  if (!configured || isPwaResource(pathname)) return response;

  const supabase = createServerClient(supabaseUrl!, publishableKey!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const authenticated = !error && Boolean(data?.claims?.sub);
  if (!authenticated && !isPublicPath(pathname) && !previewAllowed) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`,
    );
    return redirectWithCookies(loginUrl, response);
  }

  if (authenticated && (pathname === "/login" || pathname === "/register")) {
    const nextUrl = new URL(
      safeNextPath(request.nextUrl.searchParams.get("next")),
      request.url,
    );
    return redirectWithCookies(nextUrl, response);
  }

  return response;
}
