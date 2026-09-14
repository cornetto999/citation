import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabaseAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

// Dummy WebSocket class for SSR to bypass the RealtimeClient error in Node 20
class DummyWebSocket {
  constructor() {}
  close() {}
  send() {}
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    transport:
      typeof window === "undefined" ? (DummyWebSocket as any) : undefined,
  },
});
