import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !request.cookies.getAll().some(({name}) => name.startsWith("sb-"))) return response;
  const auth = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const {name, value} of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const {name, value, options} of values) response.cookies.set(name, value, options);
      },
    },
  });
  await auth.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/", "/beheer", "/archief", "/import"] };
