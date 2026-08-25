import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { isSupabaseConfigured } from "@/lib/supabase/client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function getSupabaseServerClient() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();
  return createServerClient(supabaseUrl!, publishableKey!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. The proxy refreshes them.
        }
      },
    },
  });
}
