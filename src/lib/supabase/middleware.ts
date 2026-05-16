import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const publicRoutes = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/callback",
];

function supabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ""
  );
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabaseKey();

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or API key in .env.local");
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  let user = null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // Network or token issues — try cookie session without round-trip
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData.session?.user ?? null;
    } else {
      user = data.user;
    }
  } catch (err) {
    console.error(
      "Supabase auth unreachable in middleware (check URL/key/network):",
      err instanceof Error ? err.message : err,
    );
    const { data: sessionData } = await supabase.auth.getSession();
    user = sessionData.session?.user ?? null;
  }

  const path = request.nextUrl.pathname;
  const isPublic = publicRoutes.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (path === "/login" || path === "/signup")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path !== "/subscribe" && !isPublic) {
    try {
      const { data: sub, error } = await supabase
        .from("my_subscription_view")
        .select("is_active")
        .maybeSingle();

      if (!error && sub && !sub.is_active) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/subscribe";
        return NextResponse.redirect(redirectUrl);
      }
    } catch {
      // Don't block app if subscription view missing or API down
    }
  }

  return supabaseResponse;
}
