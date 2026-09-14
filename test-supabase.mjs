import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  console.log("Checking Supabase connection to:", supabaseUrl);
  const { data, error } = await supabase.from("users").select("*");

  if (error) {
    console.error("Error querying users table:", error);
  } else {
    console.log("Successfully connected. Users found:", data);
  }
}

testConnection();
