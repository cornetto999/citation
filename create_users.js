import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://goriecoogiwiezrrrcdh.supabase.co";
const supabaseAnonKey = "sb_publishable_-6pkexjRg2DCsDn1BydoDQ_Fc6pNTSS";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const users = [
    {
      email: "jakeroaya@gmail.com",
      password: "jake123",
      data: {
        role: "enforcer",
        name: "Jake Roaya",
        unit: "Gitagum Traffic Management Office",
      },
    },
    {
      email: "francisjake@gmail.com",
      password: "koy123@",
      data: {
        role: "treasury",
        name: "Francis Jake",
        unit: "Municipal Treasurer's Office",
      },
    },
    {
      email: "roayajake@gmail.com",
      password: "roaya123",
      data: {
        role: "pnp",
        name: "Roaya Jake",
        unit: "Gitagum Municipal Police Station",
      },
    },
  ];

  for (const u of users) {
    const { data, error } = await supabase.auth.signUp({
      email: u.email,
      password: u.password,
      options: {
        data: u.data,
      },
    });

    if (error) {
      console.error(`Error creating ${u.email}:`, error.message);
    } else {
      console.log(`Created ${u.email} successfully.`);
    }
  }
}

main();
