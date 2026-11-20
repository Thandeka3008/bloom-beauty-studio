const BOOKING = {
  ownerWhatsapp: "27774152008",   // Bloom's WhatsApp number, with country code and no + or spaces
  openDays: [1, 2, 3, 4, 5, 6],   // 0 = Sunday ... 6 = Saturday (Sunday closed)
  open: "09:00",
  close: "17:00",
  stepMin: 30,                    // a new start time every 30 minutes
  leadHours: 2,                   // bookings must start at least 2 hours from now
  windowDays: 30,                 // how far ahead clients can book
  depositPercent: 50,             // the suggested deposit
  depositStep: 50,                // deposit buttons go up in R50 steps
  maxPhotoMB: 5,
  // Change this to the owner's real bank details
  bankDetails: "Bank: FNB. Account name: Bloom Beauty Studio. Account number: 0000000000. Reference: your name."
};

const TZ = "Africa/Johannesburg";   // South Africa is UTC+2 all year
const OFFSET = "+02:00";

let me = null;
let services = [];
let chosenTime = null;
let chosenDeposit = null;
let slotRequest = 0;

const $ = (id) => document.getElementById(id);

function para(text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  return p;
}

function showMsg(text, kind) {
  const box = $("book-msg");
  box.textContent = text || "";
  box.className = "msg " + (kind || "error");
  box.hidden = !text;
  if (text) box.scrollIntoView({ behavior: "smooth", block: "center" });
}

function money(n) {
  return "R" + Number(n).toLocaleString("en-ZA").replace(/\u00a0/g, " ");
}

function niceLength(l) {
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function niceDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : "");
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: TZ, weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
}

function saToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });   // YYYY-MM-DD
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00" + OFFSET);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekday(dateStr) {
  return new Date(dateStr + "T12:00:00" + OFFSET).getUTCDay();
}

function slotTime(dateStr, hhmm) {
  return new Date(dateStr + "T" + hhmm + ":00" + OFFSET);
}

const toMins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const toHHMM = (mins) => String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");

function selectedService() {
  return services.find((s) => s.id === $("service").value);
}

function fileExt(file, fallback) {
  return ((file.name.split(".").pop() || fallback).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)) || fallback;
}

function newId() {
  return window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
}

function updateSummary() {
  const box = $("summary");
  const svc = selectedService();
  const date = $("date").value;
  if (!svc || !date || !chosenTime) { box.hidden = true; return; }
  const when = fmtDateTime(slotTime(date, chosenTime).toISOString());
  box.textContent =
    svc.name + " (" + niceLength(svc.length) + ") from " + money(svc.price_zar) +
    ", about " + niceDuration(svc.duration_min) + ", on " + when + ". " +
    (chosenDeposit ? "Deposit: " + money(chosenDeposit) + ". " : "") +
    "Bloom confirms the final price when she checks your request.";
  box.hidden = false;
}

/* ---------- Deposit amounts ---------- */

function renderDeposits() {
  const step = $("deposit-step");
  const box = $("amounts");
  const svc = selectedService();
  chosenDeposit = null;
  box.replaceChildren();
  if (!svc || !chosenTime) { step.hidden = true; return; }

  $("bank").textContent = BOOKING.bankDetails;
  const suggested = Math.round(svc.price_zar * BOOKING.depositPercent / 100);
  const amounts = [];
  for (let a = BOOKING.depositStep; a <= svc.price_zar; a += BOOKING.depositStep) amounts.push(a);
  if (!amounts.includes(suggested)) amounts.push(suggested);
  amounts.sort((a, b) => a - b);

  for (const a of amounts) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot amount";
    b.textContent = money(a) + (a === suggested ? " (" + BOOKING.depositPercent + "%)" : "");
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      chosenDeposit = a;
      box.querySelectorAll(".amount").forEach((x) => {
        x.classList.toggle("selected", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      updateSummary();
    });
    box.append(b);
  }
  $("deposit-hint").textContent = "Bloom asks for at least " + BOOKING.depositPercent + "% (" + money(suggested) + ") to secure your slot.";
  step.hidden = false;
}

/* ---------- Services and times ---------- */

async function loadServices() {
  const { data, error } = await sb
    .from("services")
    .select("id, name, length, price_zar, duration_min")
    .eq("active", true)
    .order("name")
    .order("price_zar");
  const sel = $("service");
  sel.replaceChildren();
  if (error || !data || !data.length) {
    const o = document.createElement("option");
    o.textContent = "No services available";
    sel.append(o);
    return;
  }
  services = data;
  const first = document.createElement("option");
  first.value = "";
  first.textContent = "Choose a service...";
  sel.append(first);
  for (const s of data) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name + " - " + niceLength(s.length) + " - " + money(s.price_zar);
    sel.append(o);
  }
}

async function loadSlots() {
  const box = $("slots");
  const svc = selectedService();
  const date = $("date").value;
  chosenTime = null;
  renderDeposits();
  updateSummary();
  box.replaceChildren();

  if (!svc || !date) { box.append(para("Choose a service and a date to see the times.")); return; }
  if (!BOOKING.openDays.includes(weekday(date))) {
    box.append(para("Bloom is closed on this day. Please pick another date."));
    return;
  }

  const mine = ++slotRequest;
  box.append(para("Checking times..."));
  const dayStart = slotTime(date, BOOKING.open);
  const dayEnd = slotTime(date, BOOKING.close);
  const { data, error } = await sb.rpc("busy_slots", {
    from_ts: dayStart.toISOString(),
    to_ts: dayEnd.toISOString()
  });
  if (mine !== slotRequest) return;   // the person changed their choice meanwhile
  box.replaceChildren();
  if (error) { box.append(para("Could not load the times. Please try again.")); return; }

  const busy = (data || []).map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
  const earliest = Date.now() + BOOKING.leadHours * 3600000;
  const duration = svc.duration_min * 60000;
  let free = 0, shown = 0;

  for (let m = toMins(BOOKING.open); m + svc.duration_min <= toMins(BOOKING.close); m += BOOKING.stepMin) {
    const start = slotTime(date, toHHMM(m)).getTime();
    const end = start + duration;
    if (start < earliest) continue;                       // already passed or too soon
    const taken = busy.some(([s, e]) => start < e && end > s);
    shown++;

    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (taken ? " taken" : "");
    b.dataset.time = toHHMM(m);

    if (taken) {
      b.disabled = true;
      b.setAttribute("aria-label", toHHMM(m) + ", already booked");
      b.textContent = toHHMM(m);
      const tag = document.createElement("small");
      tag.textContent = "Booked";
      b.append(tag);
    } else {
      free++;
      b.textContent = toHHMM(m);
      b.addEventListener("click", () => {
        chosenTime = b.dataset.time;
        box.querySelectorAll(".slot").forEach((x) => x.classList.toggle("selected", x === b));
        renderDeposits();
        updateSummary();
      });
    }
    box.append(b);
  }
  if (!shown) box.append(para("No times left on this day. Please pick another date."));
  else if (!free) box.append(para("Every time on this day is booked. Please pick another date."));
}

/* ---------- My bookings ---------- */

const STATUS = {
  requested: ["Requested", "Waiting for Bloom to check your deposit and confirm."],
  accepted: ["Accepted - deposit due", ""],
  booked: ["Confirmed", "Your booking is confirmed. See you soon!"],
  completed: ["Completed", "Thank you for visiting Bloom Beauty Studio."],
  cancelled: ["Cancelled", ""],
  declined: ["Declined", ""],
  no_show: ["Missed", "This appointment was marked as missed."]
};

function whatsappLink(text) {
  return "https://wa.me/" + BOOKING.ownerWhatsapp + "?text=" + encodeURIComponent(text);
}

function renderBooking(b) {
  const item = document.createElement("article");
  item.className = "bk";

  const head = document.createElement("div");
  head.className = "bk-head";
  const title = document.createElement("strong");
  const svc = b.services || {};
  title.textContent = (svc.name || "Booking") + (svc.length ? " (" + niceLength(svc.length) + ")" : "");
  const badge = document.createElement("span");
  badge.className = "badge st-" + b.status;
  badge.textContent = (STATUS[b.status] || [b.status])[0];
  head.append(title, badge);

  const when = document.createElement("p");
  when.className = "bk-when";
  when.textContent = fmtDateTime(b.starts_at);

  item.append(head, when);

  const note = document.createElement("p");
  note.className = "muted";
  const paid = b.deposit_amount ? " Deposit sent: " + money(b.deposit_amount) + "." : "";
  if (b.status === "requested") {
    note.textContent = "Waiting for Bloom to check your proof of payment and confirm." + paid;
  } else if (b.status === "accepted") {
    const price = b.price_zar != null ? b.price_zar : (svc.price_zar || 0);
    const deposit = Math.round(price * BOOKING.depositPercent / 100);
    note.textContent = "Price: " + money(price) + ". Please pay a " + BOOKING.depositPercent +
      "% deposit of " + money(deposit) + " by EFT and send your proof of payment on WhatsApp. " +
      BOOKING.bankDetails;
  } else if (b.status === "declined") {
    note.textContent = (b.decline_reason
      ? "Bloom could not take this booking: " + b.decline_reason
      : "Bloom could not take this booking. Please choose another time.") +
      (b.deposit_amount ? " Your deposit of " + money(b.deposit_amount) + " will be refunded." : "");
  } else if (b.status === "booked") {
    note.textContent = "Confirmed." + (b.price_zar != null ? " Price: " + money(b.price_zar) + "." : "") +
      (b.deposit_amount ? " Deposit of " + money(b.deposit_amount) + " received." : " Deposit received.");
  } else {
    note.textContent = (STATUS[b.status] || [])[1] || "";
  }
  if (note.textContent) item.append(note);

  const actions = document.createElement("div");
  actions.className = "bk-actions";

  if (b.status === "accepted") {
    const a = document.createElement("a");
    a.href = whatsappLink("Hi Bloom, I have paid my deposit for " + fmtDateTime(b.starts_at) + ". Proof attached.");
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "btn btn-small";
    a.textContent = "Send proof on WhatsApp";
    actions.append(a);
  }

  const active = ["requested", "accepted", "booked"].includes(b.status);
  if (active && new Date(b.starts_at) > new Date()) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "link";
    cancel.textContent = "Cancel booking";
    cancel.addEventListener("click", async () => {
      if (!confirm("Cancel this booking?")) return;
      cancel.disabled = true;
      const { error } = await sb.rpc("cancel_my_booking", { booking_id: b.id });
      if (error) { showMsg("Could not cancel: " + error.message); cancel.disabled = false; return; }
      await loadMyBookings();
      loadSlots();
    });
    actions.append(cancel);
  }
  if (actions.children.length) item.append(actions);
  return item;
}

async function loadMyBookings() {
  const box = $("my-bookings");
  const { data, error } = await sb
    .from("bookings")
    .select("id, starts_at, ends_at, status, price_zar, deposit_amount, decline_reason, contact_phone, services(name, length, price_zar)")
    .eq("client_id", me.id)
    .order("starts_at", { ascending: false });
  box.replaceChildren();
  if (error) { console.error(error); box.append(para("Could not load your bookings. Please refresh.")); return data; }
  if (!data.length) { box.append(para("You have no bookings yet.")); return data; }
  data.forEach((b) => box.append(renderBooking(b)));
  return data;
}

/* ---------- Sending a request ---------- */

function setBusy(busy) {
  const btn = $("book-form").querySelector("button[type=submit]");
  btn.disabled = busy;
  btn.textContent = busy ? "Sending..." : "Request booking";
}

async function uploadFile(file, prefix, fallbackExt) {
  const path = me.id + "/" + prefix + newId() + "." + fileExt(file, fallbackExt);
  const up = await sb.storage.from("references").upload(path, file, { contentType: file.type });
  return up.error ? null : path;
}

async function submitBooking(e) {
  e.preventDefault();
  showMsg("");
  const svc = selectedService();
  const date = $("date").value;
  const phone = $("phone").value.trim();
  const notes = $("notes").value.trim();
  const photo = $("photo").files[0];
  const pop = $("pop").files[0];
  const maxBytes = BOOKING.maxPhotoMB * 1024 * 1024;

  if (!svc) return showMsg("Please choose a service.");
  if (!date) return showMsg("Please choose a date.");
  if (!chosenTime) return showMsg("Please choose a time.");
  if (!chosenDeposit) return showMsg("Please choose how much deposit you paid.");
  if (!pop) return showMsg("Please upload your proof of payment.");
  if (!(pop.type.startsWith("image/") || pop.type === "application/pdf")) return showMsg("The proof of payment must be a photo or a PDF.");
  if (pop.size > maxBytes) return showMsg("The proof of payment is too big. Please use a file under " + BOOKING.maxPhotoMB + " MB.");
  if (phone.replace(/\D/g, "").length < 9) return showMsg("Please enter a phone number Bloom can reach you on.");
  if (photo) {
    if (!photo.type.startsWith("image/")) return showMsg("The reference file must be a photo.");
    if (photo.size > maxBytes) return showMsg("The photo is too big. Please use one under " + BOOKING.maxPhotoMB + " MB.");
  }

  setBusy(true);

  const popPath = await uploadFile(pop, "pop-", "pdf");
  if (!popPath) {
    showMsg("Could not upload the proof of payment. Please try again.");
    setBusy(false);
    return;
  }

  let photoPath = null;
  if (photo) {
    photoPath = await uploadFile(photo, "", "jpg");
    if (!photoPath) {
      showMsg("Could not upload the reference photo. Try a smaller image, or book without one.");
      setBusy(false);
      return;
    }
  }

  const start = slotTime(date, chosenTime);
  const end = new Date(start.getTime() + svc.duration_min * 60000);
  const { error } = await sb.from("bookings").insert({
    client_id: me.id,
    service_id: svc.id,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    notes: notes,
    reference_image_path: photoPath,
    contact_phone: phone,
    deposit_amount: chosenDeposit,
    pop_path: popPath
  });

  if (error) {
    if (error.code === "23P01") showMsg("Sorry, that time was just taken. Please choose another.");
    else showMsg("Something went wrong: " + error.message);
    await loadSlots();
    setBusy(false);
    return;
  }

  showMsg("Request sent! Bloom will check your payment and confirm. You can follow it under My bookings.", "ok");
  $("notes").value = "";
  $("photo").value = "";
  $("pop").value = "";
  await Promise.all([loadMyBookings(), loadSlots()]);
  setBusy(false);
}

async function startClient(profile) {
  me = profile;
  const today = saToday();
  $("date").min = today;
  $("date").max = addDays(today, BOOKING.windowDays);

  $("service").addEventListener("change", loadSlots);
  $("date").addEventListener("change", loadSlots);
  $("book-form").addEventListener("submit", submitBooking);

  await loadServices();
  const mine = await loadMyBookings();
  const lastPhone = (mine || []).map((b) => b.contact_phone).find(Boolean);
  $("phone").value = lastPhone || profile.phone || "";
}