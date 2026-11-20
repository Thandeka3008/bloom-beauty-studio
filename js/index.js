const msgBox = document.getElementById("message");
const formIn = document.getElementById("form-in");
const formUp = document.getElementById("form-up");
const tabIn = document.getElementById("tab-in");
const tabUp = document.getElementById("tab-up");

function showMessage(text, kind) {
  msgBox.textContent = text;
  msgBox.className = "msg " + (kind || "error");
  msgBox.hidden = !text;
}

function showTab(which) {
  const signIn = which === "in";
  formIn.hidden = !signIn;
  formUp.hidden = signIn;
  tabIn.classList.toggle("active", signIn);
  tabUp.classList.toggle("active", !signIn);
  tabIn.setAttribute("aria-selected", String(signIn));
  tabUp.setAttribute("aria-selected", String(!signIn));
  showMessage("");
}

tabIn.addEventListener("click", () => showTab("in"));
tabUp.addEventListener("click", () => showTab("up"));

function friendlyError(error) {
  const m = (error.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Incorrect email or password.";
  if (m.includes("already registered")) return "An account with this email already exists. Try signing in.";
  if (m.includes("email not confirmed")) return "Please confirm your email first, then sign in.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("password")) return error.message;
    return "Something went wrong: " + (error.message || "unknown error");
}

async function goHome() {
  const profile = await getProfile();
  if (!profile) {
    await sb.auth.signOut();
    showMessage("Your account isn't set up yet. Please contact the salon.");
    return;
  }
  location.replace(HOME[profile.role] || "client.html");
}

function setBusy(form, busy) {
  form.querySelector("button[type=submit]").disabled = busy;
}

formIn.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("in-email").value.trim();
  const password = document.getElementById("in-password").value;
  if (!email || !password) return showMessage("Please enter your email and password.");

  setBusy(formIn, true);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    showMessage(friendlyError(error));
    setBusy(formIn, false);
    return;
  }
  await goHome();
  setBusy(formIn, false);
});

formUp.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fullName = document.getElementById("up-name").value.trim();
  const email = document.getElementById("up-email").value.trim();
  const password = document.getElementById("up-password").value;
  const confirm = document.getElementById("up-confirm").value;

  if (!fullName || !email || !password) return showMessage("Please fill in all the fields.");
  if (password.length < 8) return showMessage("Your password must be at least 8 characters.");
  if (password !== confirm) return showMessage("The passwords do not match.");

  setBusy(formUp, true);
  // The role is NOT sent from here. The database always makes new sign-ups clients.
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) {
    showMessage(friendlyError(error));
    setBusy(formUp, false);
    return;
  }

  if (data.session) {
    await goHome();
  } else {
    showTab("in");
    showMessage("Account created. Check your email to confirm it, then sign in.", "ok");
  }
  setBusy(formUp, false);
});

(async () => {
  if (!sb) {
    showMessage("Setup needed: add your Supabase details to config.js.");
    formIn.querySelector("button[type=submit]").disabled = true;
    formUp.querySelector("button[type=submit]").disabled = true;
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const profile = await getProfile();
    if (profile) location.replace(HOME[profile.role] || "client.html");
  }
})();

// Show / hide password buttons
document.querySelectorAll(".pw-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
});

   