import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && publishableKey);
export const isMockApiEnabled =
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true";
export const isPreviewModeAllowed =
  !isSupabaseConfigured || isMockApiEnabled;

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl!, publishableKey!);
  }
  return browserClient;
}
