const HOME = { owner: "owner.html", stylist: "stylist.html", client: "client.html" };

function configOk() {
  const c = window.CONFIG || {};
  return Boolean(c.SUPABASE_URL && c.SUPABASE_ANON_KEY) &&
         !c.SUPABASE_URL.startsWith("PASTE") && !c.SUPABASE_ANON_KEY.startsWith("PASTE");
}

const sb = configOk()
  ? window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY)
  : null;

async function getProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  return data;
}

// Guards a role page. This only controls what the page shows; the real protection
// of data is the Row Level Security in the database.
async function initRolePage(role) {
  const loading = document.getElementById("loading");
  const page = document.getElementById("page");

  document.getElementById("signout").addEventListener("click", async () => {
    if (sb) await sb.auth.signOut();
    location.replace("index.html");
  });

  if (!sb) {
    loading.textContent = "Setup needed: add your Supabase details to config.js.";
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return location.replace("index.html");

  const profile = await getProfile();
  if (!profile) {
    await sb.auth.signOut();
    return location.replace("index.html");
  }

  if (profile.role !== role) return location.replace(HOME[profile.role] || "index.html");

  document.getElementById("welcome").textContent = profile.full_name || "there";
  loading.hidden = true;
  page.hidden = false;
}