// Owner page: requests, accept / decline with price, deposits, appointments and clients.

const OWNER = { depositPercent: 50 };
const OWNER_TZ = "Africa/Johannesburg";

let owner = null;
let bookings = [];
let clients = [];
let tab = "requests";
let bookingsByClient = {};

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function money(n) {
  return "R" + Number(n || 0).toLocaleString("en-ZA").replace(/\u00a0/g, " ");
}

function niceLength(l) {
  return l ? l.charAt(0).toUpperCase() + l.slice(1) : "";
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: OWNER_TZ, weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
}

function saDate(d) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: OWNER_TZ });   // YYYY-MM-DD
}

function depositOf(price) {
  return Math.round(Number(price || 0) * OWNER.depositPercent / 100);
}

function showMsg(text, kind) {
  const box = $("owner-msg");
  box.textContent = text || "";
  box.className = "msg " + (kind || "error");
  box.hidden = !text;
}

// South African numbers like 082 123 4567 become 27821234567 for WhatsApp
function waLink(phone, text) {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "27" + d.slice(1);
  if (d.length < 11) return null;
  return "https://wa.me/" + d + "?text=" + encodeURIComponent(text);
}

function clientName(b) {
  return (b.profiles && b.profiles.full_name) || "Client";
}

function clientPhone(b) {
  return b.contact_phone || (b.profiles && b.profiles.phone) || "";
}

function whatsappText(b) {
  const name = clientName(b).split(" ")[0];
  const when = fmtDateTime(b.starts_at);
  if (b.status === "accepted") {
    return "Hi " + name + ", this is Bloom Beauty Studio. Your booking for " + when +
      " is accepted. The price is " + money(b.price_zar) + ". Please pay the " + OWNER.depositPercent +
      "% deposit of " + money(depositOf(b.price_zar)) + " by EFT and send your proof of payment here.";
  }
  if (b.status === "booked") {
    return "Hi " + name + ", your deposit is received and your booking for " + when + " is confirmed. See you soon!";
  }
  if (b.status === "declined") {
    return "Hi " + name + ", sorry, Bloom can't take your booking for " + when + "." +
      (b.decline_reason ? " " + b.decline_reason : "") + " Please book another time.";
  }
  return "Hi " + name + ", this is Bloom Beauty Studio about your booking for " + when + ".";
}

/* ---------- Loading data ---------- */

async function loadBookings() {
  const { data, error } = await sb
    .from("bookings")
    .select("id, client_id, starts_at, ends_at, status, notes, price_zar, deposit_paid, decline_reason, contact_phone, reference_image_path, deposit_amount, pop_path, services(name, length, price_zar), profiles(full_name, phone)")
    .order("starts_at", { ascending: true });
  if (error) {
    showMsg("Could not load bookings: " + error.message);
    bookings = [];
    return;
  }
  bookings = data || [];
}

async function loadClients() {
  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, phone, role, suspended")
    .order("full_name");
  if (error) {
    showMsg("Could not load clients: " + error.message);
    clients = [];
    return;
  }
  clients = (data || []).filter((p) => p.role !== "owner");
}

async function refresh() {
  await Promise.all([loadBookings(), loadClients()]);
  bookingsByClient = {};
  bookings.forEach((b) => { bookingsByClient[b.client_id] = (bookingsByClient[b.client_id] || 0) + 1; });
  render();
}

async function updateBooking(id, fields, okText) {
  showMsg("");
  const { error } = await sb.from("bookings").update(fields).eq("id", id);
  if (error) {
    showMsg("Could not update the booking: " + error.message);
    return false;
  }
  await refresh();
  if (okText) showMsg(okText, "ok");
  return true;
}

/* ---------- Lists ---------- */

function lists() {
  const now = Date.now();
  const soonest = (a, b) => new Date(a.starts_at) - new Date(b.starts_at);
  return {
    requests: bookings.filter((b) => b.status === "requested").sort(soonest),
    upcoming: bookings.filter((b) => b.status === "accepted" || b.status === "booked").sort(soonest),
    history: bookings
      .filter((b) => ["completed", "cancelled", "declined", "no_show"].includes(b.status))
      .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)),
    now
  };
}

function renderStats() {
  const today = saDate(new Date());
  const month = today.slice(0, 7);
  const todays = bookings.filter((b) => saDate(b.starts_at) === today);
  const done = bookings.filter((b) => b.status === "completed");

  $("stat-today").textContent = todays.filter((b) => ["accepted", "booked", "completed"].includes(b.status)).length;
  $("stat-income").textContent = money(done.filter((b) => saDate(b.starts_at) === today)
    .reduce((sum, b) => sum + (b.price_zar || 0), 0));
  $("stat-month").textContent = money(done.filter((b) => saDate(b.starts_at).startsWith(month))
    .reduce((sum, b) => sum + (b.price_zar || 0), 0));
  $("stat-requests").textContent = bookings.filter((b) => b.status === "requested").length;
  $("stat-deposits").textContent = money(bookings
    .filter((b) => b.deposit_paid && b.deposit_amount &&
      ["accepted", "booked", "completed", "no_show"].includes(b.status) &&
      saDate(b.created_at || b.starts_at).startsWith(month))
    .reduce((sum, b) => sum + b.deposit_amount, 0));
}

function render() {
  renderStats();
  const l = lists();
  const counts = { requests: l.requests.length, upcoming: l.upcoming.length };
  document.querySelectorAll(".owner-tabs .tab").forEach((t) => {
    const name = t.dataset.tab;
    const label = { requests: "Requests", upcoming: "Upcoming", history: "History", clients: "Clients" }[name];
    t.textContent = counts[name] ? label + " (" + counts[name] + ")" : label;
    t.classList.toggle("active", name === tab);
    t.setAttribute("aria-selected", String(name === tab));
  });

  const box = $("list");
  box.replaceChildren();

  if (tab === "clients") return renderClients(box);

  const items = l[tab];
  if (!items.length) {
    const empty = {
      requests: "No new requests. New bookings from clients will appear here.",
      upcoming: "No accepted or confirmed appointments yet.",
      history: "Finished, cancelled and declined bookings will appear here."
    }[tab];
    box.append(el("p", "muted", empty));
    return;
  }
  items.forEach((b) => box.append(renderBooking(b)));
}

const BADGE = {
  requested: "New request",
  accepted: "Waiting for deposit",
  booked: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "No-show"
};

function renderBooking(b) {
  const item = el("article", "bk");
  const svc = b.services || {};

  const head = el("div", "bk-head");
  head.append(el("strong", null, clientName(b)), el("span", "badge st-" + b.status, BADGE[b.status] || b.status));
  item.append(head);

  item.append(el("p", "bk-when", fmtDateTime(b.starts_at)));
  item.append(el("p", "muted", (svc.name || "Service") + (svc.length ? " (" + niceLength(svc.length) + ")" : "") +
    (svc.price_zar != null ? ", from " + money(svc.price_zar) : "")));

  const phone = clientPhone(b);
  if (phone) {
    const p = el("p", "muted");
    p.append("Phone: ");
    const a = el("a", null, phone);
    a.href = "tel:" + phone.replace(/[^\d+]/g, "");
    p.append(a);
    item.append(p);
  }

  if (b.notes) item.append(el("p", "bk-notes", "Notes: " + b.notes));

  if (b.price_zar != null && ["accepted", "booked", "completed", "no_show"].includes(b.status)) {
    const paid = b.deposit_paid
      ? "deposit paid" + (b.deposit_amount ? " (" + money(b.deposit_amount) + ")" : "")
      : "deposit of " + money(depositOf(b.price_zar)) + " not paid yet";
    item.append(el("p", "muted", "Price: " + money(b.price_zar) + ", " + paid + "."));
  }
  if (b.status === "declined" && b.decline_reason) {
    item.append(el("p", "muted", "Reason: " + b.decline_reason));
  }

  if (b.deposit_amount) {
    const line = b.status === "declined" || b.status === "cancelled"
      ? "Client paid a deposit of " + money(b.deposit_amount) + ". Remember to refund it."
      : "Client paid a deposit of " + money(b.deposit_amount) + ".";
    item.append(el("p", "bk-deposit", line));
  }
  if (b.pop_path) item.append(fileBlock(b.pop_path, "View proof of payment", "Proof of payment from the client"));
  if (b.reference_image_path) item.append(fileBlock(b.reference_image_path, "View reference photo", "Nail design reference from the client"));

  const actions = el("div", "bk-actions");
  const started = new Date(b.starts_at).getTime() <= Date.now();

  if (b.status === "requested") {
    item.append(requestControls(b));
  } else if (b.status === "accepted") {
    const paid = el("button", "btn btn-small", "Deposit received");
    paid.type = "button";
    paid.addEventListener("click", async () => {
      paid.disabled = true;
      if (!(await updateBooking(b.id, { status: "booked", deposit_paid: true }, "Booking confirmed."))) paid.disabled = false;
    });
    actions.append(paid, cancelButton(b));
  } else if (b.status === "booked") {
    if (started) {
      const done = el("button", "btn btn-small", "Completed");
      done.type = "button";
      done.addEventListener("click", () => updateBooking(b.id, { status: "completed" }, "Marked as completed."));
      const miss = el("button", "btn btn-small btn-ghost", "No-show");
      miss.type = "button";
      miss.addEventListener("click", () => {
        if (confirm("Mark " + clientName(b) + " as a no-show?")) updateBooking(b.id, { status: "no_show" }, "Marked as a no-show.");
      });
      actions.append(done, miss);
    } else {
      actions.append(cancelButton(b));
    }
  }

  if (b.status !== "requested") {
    const link = waLink(phone, whatsappText(b));
    if (link && ["accepted", "booked", "declined"].includes(b.status)) {
      const wa = el("a", "link", "Message on WhatsApp");
      wa.href = link;
      wa.target = "_blank";
      wa.rel = "noopener";
      actions.append(wa);
    }
  }

  if (actions.children.length) item.append(actions);
  return item;
}

function cancelButton(b) {
  const c = el("button", "link", "Cancel booking");
  c.type = "button";
  c.addEventListener("click", () => {
    if (confirm("Cancel " + clientName(b) + "'s booking on " + fmtDateTime(b.starts_at) + "?")) {
      updateBooking(b.id, { status: "cancelled" }, "Booking cancelled.");
    }
  });
  return c;
}

// Accept with a price, or decline with a reason
function requestControls(b) {
  const wrap = el("div", "req");
  const svc = b.services || {};

  const acceptRow = el("div", "row");
  const label = el("label", "row-label", "Price (R)");
  const price = el("input");
  price.type = "number";
  price.min = "0";
  price.step = "10";
  price.inputMode = "numeric";
  price.value = svc.price_zar != null ? svc.price_zar : "";
  price.id = "price-" + b.id;
  label.htmlFor = price.id;
  const hasPop = Boolean(b.pop_path);
  const accept = el("button", "btn btn-small", hasPop ? "Accept and confirm" : "Accept");
  accept.type = "button";
  acceptRow.append(label, price, accept);

  const deposit = el("p", "muted");
  const showDeposit = () => {
    if (hasPop) {
      deposit.textContent = "Check the proof of payment first. Accepting confirms the booking.";
      return;
    }
    deposit.textContent = price.value ? "Deposit (" + OWNER.depositPercent + "%): " + money(depositOf(price.value)) : "";
  };
  price.addEventListener("input", showDeposit);
  showDeposit();

  accept.addEventListener("click", async () => {
    const value = Math.round(Number(price.value));
    if (!price.value || !(value >= 0)) { showMsg("Type the price before accepting."); price.focus(); return; }
    accept.disabled = true;
    const ok = hasPop
      ? await updateBooking(b.id, { status: "booked", price_zar: value, deposit_paid: true },
          "Confirmed. The booking is now under Upcoming.")
      : await updateBooking(b.id, { status: "accepted", price_zar: value },
          "Accepted. Open the Upcoming tab to message " + clientName(b) + " about the deposit.");
    if (!ok) accept.disabled = false;
  });

  const declineOpen = el("button", "link", "Decline");
  declineOpen.type = "button";
  const declineBox = el("div", "row");
  declineBox.hidden = true;
  const reason = el("input");
  reason.type = "text";
  reason.maxLength = 200;
  reason.placeholder = "Reason (optional), e.g. fully booked that day";
  reason.setAttribute("aria-label", "Reason for declining");
  const declineGo = el("button", "btn btn-small btn-ghost", "Decline booking");
  declineGo.type = "button";
  declineBox.append(reason, declineGo);

  declineOpen.addEventListener("click", () => {
    declineBox.hidden = !declineBox.hidden;
    if (!declineBox.hidden) reason.focus();
  });
  declineGo.addEventListener("click", async () => {
    declineGo.disabled = true;
    const ok = await updateBooking(b.id, { status: "declined", decline_reason: reason.value.trim() },
      "Declined. The time is free again.");
    if (!ok) declineGo.disabled = false;
  });

  wrap.append(acceptRow, deposit, declineOpen, declineBox);
  return wrap;
}

// Photos and proofs of payment are private, so they are shown through a link that expires after an hour
function fileBlock(path, label, alt) {
  const box = el("div", "bk-photo");
  const btn = el("button", "link", label);
  btn.type = "button";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Loading...";
    const { data, error } = await sb.storage.from("references").createSignedUrl(path, 3600);
    if (error || !data) {
      btn.textContent = "Could not load the file";
      return;
    }
    if (/\.pdf$/i.test(path)) {
      const a = el("a", "btn btn-small btn-ghost", "Open PDF");
      a.href = data.signedUrl;
      a.target = "_blank";
      a.rel = "noopener";
      box.replaceChildren(a);
      return;
    }
    const img = el("img");
    img.src = data.signedUrl;
    img.alt = alt;
    box.replaceChildren(img);
  });
  box.append(btn);
  return box;
}

/* ---------- Clients ---------- */

function renderClients(box) {
  if (!clients.length) {
    box.append(el("p", "muted", "No clients yet. People who sign up will appear here."));
    return;
  }

  const active = clients.filter((c) => !c.suspended);
  const suspended = clients.filter((c) => c.suspended);

  if (active.length) active.forEach((c) => box.append(renderClient(c)));
  else box.append(el("p", "muted", "No active clients."));

  if (suspended.length) {
    box.append(el("h3", "list-title", "Suspended clients (" + suspended.length + ")"));
    box.append(el("p", "muted", "These clients can sign in but can't make new bookings."));
    suspended.forEach((c) => box.append(renderClient(c)));
  }
}

function renderClient(c) {
  const item = el("article", "bk");
  const head = el("div", "bk-head");
  head.append(el("strong", null, c.full_name || "No name"));
  if (c.suspended) head.append(el("span", "badge st-declined", "Suspended"));
  item.append(head);

  item.append(el("p", "muted", (c.phone ? "Phone: " + c.phone + ". " : "") +
    countFor(c) + " booking" + (countFor(c) === 1 ? "" : "s") + "."));

  const actions = el("div", "bk-actions");
  const edit = el("button", "link", "Edit");
  edit.type = "button";
  const suspend = el("button", "link", c.suspended ? "Unsuspend" : "Suspend");
  suspend.type = "button";
  actions.append(edit, suspend);
  item.append(actions);

  const form = el("div", "edit");
  form.hidden = true;
  const nameLabel = el("label", null, "Full name");
  const name = el("input");
  name.value = c.full_name || "";
  name.maxLength = 80;
  name.id = "name-" + c.id;
  nameLabel.htmlFor = name.id;
  const phoneLabel = el("label", null, "Phone");
  const phone = el("input");
  phone.type = "tel";
  phone.value = c.phone || "";
  phone.id = "phone-" + c.id;
  phoneLabel.htmlFor = phone.id;
  const save = el("button", "btn btn-small", "Save changes");
  save.type = "button";
  form.append(nameLabel, name, phoneLabel, phone, save);
  item.append(form);

  edit.addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) name.focus(); });

  save.addEventListener("click", async () => {
    if (!name.value.trim()) { showMsg("The name can't be empty."); return; }
    save.disabled = true;
    const ok = await updateProfile(c.id, { full_name: name.value.trim(), phone: phone.value.trim() }, "Client details saved.");
    if (!ok) save.disabled = false;
  });

  suspend.addEventListener("click", () => {
    const question = c.suspended
      ? "Let " + (c.full_name || "this client") + " book again?"
      : "Suspend " + (c.full_name || "this client") + "? They can still sign in, but they can't make new bookings.";
    if (confirm(question)) {
      updateProfile(c.id, { suspended: !c.suspended }, c.suspended ? "Client can book again." : "Client suspended.");
    }
  });

  return item;
}

function countFor(c) {
  return bookingsByClient[c.id] || 0;
}

async function updateProfile(id, fields, okText) {
  showMsg("");
  const { data, error } = await sb.from("profiles").update(fields).eq("id", id).select("id");
  if (!error && (!data || !data.length)) {
    showMsg("The change was not saved. The database did not allow it.");
    return false;
  }
  if (error) {
    showMsg("Could not save: " + error.message);
    return false;
  }
  await refresh();
  if (okText) showMsg(okText, "ok");
  return true;
}

/* ---------- Start ---------- */

async function startOwner(profile) {
  owner = profile;
  document.querySelectorAll(".owner-tabs .tab").forEach((t) => {
    t.addEventListener("click", () => { tab = t.dataset.tab; showMsg(""); render(); });
  });
  $("refresh").addEventListener("click", async () => { showMsg(""); await refresh(); });
  await refresh();
}