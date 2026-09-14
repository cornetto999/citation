const url = "https://goriecoogiwiezrrrcdh.supabase.co/auth/v1/signup";
const apiKey = "sb_publishable_-6pkexjRg2DCsDn1BydoDQ_Fc6pNTSS";

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
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: u.email,
        password: u.password,
        data: u.data,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error(
        `Error creating ${u.email}:`,
        json.msg || json.message || JSON.stringify(json),
      );
    } else {
      console.log(`Created ${u.email} successfully.`);
    }
  }
}

main();
