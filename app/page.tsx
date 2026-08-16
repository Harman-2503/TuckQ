"use client";

import { useEffect, useMemo, useState } from "react";

type Role = "student" | "operator" | "admin";
type View = "student" | "pos" | "operator" | "account" | "import" | "admin";
type Student = {
  id: string;
  name: string;
  className: string;
  email: string;
  password: string;
  accountLimit: number;
  status: "active" | "blocked";
};
type Booking = { id: string; studentId: string; studentName: string; slot: string; status: "Booked" | "Cancelled"; createdAt: string };
type QueueEntry = { id: string; name: string; number: number; status: "WAITING" | "CALLED" | "SERVED" | "NO SHOW"; joinedAt: string };
type CatalogueItem = { id: string; day: string; name: string; category: string; price: number; stock: number };
type CartLine = { id: string; name: string; price: number; qty: number };
type Sale = { billNo: string; date: string; time: string; studentId: string; studentName: string; cashier: string; items: CartLine[] };
type Notice = { id: string; title: string; body: string; time: string; type: string; read?: boolean };
type Session = { role: Role; id: string; name: string } | null;
type TuckQState = {
  user: Session;
  open: boolean;
  paused: boolean;
  batch: number;
  slotIncrement: number;
  slotCapacity: number;
  nextNumber: number;
  served: number;
  bookings: Booking[];
  queue: QueueEntry[];
  students: Student[];
  catalogue: CatalogueItem[];
  selectedPosDay: string;
  cart: CartLine[];
  sales: Sale[];
  notices: Notice[];
  lastReceipt: Sale | null;
};

const DAILY_LIMIT = 280;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const portalCopy = {
  student: ["Student Login", "Book a 3:45-4:45 slot, cancel bookings, join the live queue, and check account billing."],
  operator: ["Operator Login", "Call batches, manage arrivals, and keep service moving."],
  admin: ["Admin Login", "Create student logins, manage menu items, download reports, and review alerts."],
};

const starter: TuckQState = {
  user: null,
  open: false,
  paused: false,
  batch: 5,
  slotIncrement: 10,
  slotCapacity: 18,
  nextNumber: 36,
  served: 214,
  bookings: [],
  queue: [],
  students: [
    { id: "TISB1042", name: "Aarav Nair", className: "Grade 9 - Nile", email: "tisb1042@tisb.ac.in", password: "student1042", accountLimit: 2500, status: "active" },
    { id: "TISB1043", name: "Diya Sharma", className: "Grade 8 - Cauvery", email: "tisb1043@tisb.ac.in", password: "student1043", accountLimit: 2500, status: "active" },
    { id: "TISB1044", name: "Rehan Pillai", className: "Grade 10 - Ganga", email: "tisb1044@tisb.ac.in", password: "student1044", accountLimit: 3000, status: "active" },
  ],
  catalogue: [
    { id: "chips-classic", day: "Everyday", name: "Chips", category: "Daily chips", price: 30, stock: 100 },
    { id: "chips-masala", day: "Everyday", name: "Masala Chips", category: "Daily chips", price: 35, stock: 90 },
    { id: "daily-lemon", day: "Everyday", name: "Lemon Juice", category: "Drink", price: 45, stock: 75 },
    { id: "daily-popcorn", day: "Everyday", name: "Popcorn", category: "Snack", price: 50, stock: 70 },
    { id: "mon-toast", day: "Monday", name: "Chicken Cheese Toast", category: "Hot food", price: 95, stock: 35 },
    { id: "mon-samosa", day: "Monday", name: "Samosa Chat", category: "Snack", price: 70, stock: 45 },
    { id: "tue-noodles-veg", day: "Tuesday", name: "Chinese Veg Noodles", category: "Hot food", price: 90, stock: 40 },
    { id: "tue-noodles-chicken", day: "Tuesday", name: "Chinese Chicken Noodles", category: "Hot food", price: 115, stock: 35 },
    { id: "wed-roll", day: "Wednesday", name: "Paneer Khatti Roll", category: "Hot food", price: 105, stock: 40 },
    { id: "wed-juice", day: "Wednesday", name: "Seasonal Fresh Juice", category: "Drink", price: 60, stock: 50 },
    { id: "thu-spring", day: "Thursday", name: "Veg Spring Roll", category: "Snack", price: 80, stock: 40 },
    { id: "thu-rice", day: "Thursday", name: "Chicken Fried Rice", category: "Hot food", price: 115, stock: 35 },
    { id: "fri-paneer", day: "Friday", name: "Malai Paneer Tikka", category: "Hot food", price: 115, stock: 35 },
    { id: "fri-65", day: "Friday", name: "Chicken 65", category: "Hot food", price: 125, stock: 35 },
    { id: "sat-fries", day: "Saturday", name: "French Fries", category: "Snack", price: 75, stock: 50 },
    { id: "sun-tikka", day: "Sunday", name: "Afghani Chicken Tikka", category: "Hot food", price: 135, stock: 30 },
  ],
  selectedPosDay: new Date().toLocaleDateString("en-US", { weekday: "long" }),
  cart: [],
  sales: [],
  notices: [
    { id: "N-1", title: "Welcome to TuckQ", body: "Bookings are open before the tuck shop starts at 3:45 PM.", time: "Today", type: "system" },
  ],
  lastReceipt: null,
};

function money(value: number) {
  return `₹${Math.max(0, value).toLocaleString("en-IN")}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function total(sale: Sale) {
  return sale.items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function billText(sale: Sale) {
  return [
    "TuckQ - TISB Tuck Shop",
    `Bill: ${sale.billNo}`,
    `Date: ${sale.date} ${sale.time}`,
    `Student: ${sale.studentName} (${sale.studentId})`,
    `Cashier: ${sale.cashier}`,
    "",
    ...sale.items.map((item) => `${item.qty} x ${item.name} @ ₹${item.price} = ₹${item.qty * item.price}`),
    "",
    `Total: ₹${total(sale)}`,
    "",
    "Please show this bill number at pickup.",
  ].join("\n");
}

function slotLabels(increment: number) {
  const labels: string[] = [];
  for (let t = 15 * 60 + 45; t < 16 * 60 + 45; t += increment) {
    const end = Math.min(t + increment, 16 * 60 + 45);
    labels.push(`${formatTime(t)}-${formatTime(end)}`);
  }
  return labels;
}

function formatTime(totalMinutes: number) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hours12 = ((hours24 + 11) % 12) + 1;
  return `${hours12}:${String(minutes).padStart(2, "0")}`;
}

function normalise(raw: TuckQState): TuckQState {
  return {
    ...starter,
    ...raw,
    students: raw.students?.length ? raw.students : starter.students,
    catalogue: raw.catalogue?.length ? raw.catalogue : starter.catalogue,
    notices: raw.notices?.length ? raw.notices : starter.notices,
    slotIncrement: raw.slotIncrement === 5 ? 5 : 10,
  };
}

export default function Home() {
  const [state, setState] = useState<TuckQState>(starter);
  const [loaded, setLoaded] = useState(false);
  const [portal, setPortal] = useState<Role>("student");
  const [screen, setScreen] = useState<"home" | "login" | "app">("home");
  const [view, setView] = useState<View>("student");
  const [bellOpen, setBellOpen] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [login, setLogin] = useState({ id: "", password: "", name: "" });
  const [posStudentId, setPosStudentId] = useState("TISB1042");
  const [posStudentName, setPosStudentName] = useState("");
  const [search, setSearch] = useState("");
  const [preorderCart, setPreorderCart] = useState<CartLine[]>([]);
  const [newStudent, setNewStudent] = useState({ id: "", name: "", className: "", email: "", password: "", limit: "2500" });
  const [newItem, setNewItem] = useState({ name: "", price: "40", day: "Everyday", category: "Snack" });
  const [importText, setImportText] = useState("");

  useEffect(() => {
    fetch("/api/tuckq")
      .then((res) => res.json())
      .then((data) => setState(normalise(data.state)))
      .catch(() => setMessage("Offline preview mode"))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const handle = setTimeout(() => {
      fetch("/api/tuckq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      }).catch(() => undefined);
    }, 350);
    return () => clearTimeout(handle);
  }, [state, loaded]);

  const student = state.user?.role === "student" ? state.students.find((entry) => entry.id === state.user?.id) : null;
  const dayItems = useMemo(
    () => state.catalogue.filter((item) => item.day === "Everyday" || item.day === state.selectedPosDay),
    [state.catalogue, state.selectedPosDay],
  );
  const filteredItems = dayItems.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
  const cartTotal = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const unread = state.notices.filter((notice) => !notice.read).length;

  function patch(updater: (draft: TuckQState) => void) {
    setState((current) => {
      const draft = structuredClone(current);
      updater(draft);
      return draft;
    });
  }

  function notify(title: string, body: string, type = "notice") {
    patch((draft) => {
      draft.notices.unshift({ id: `N-${Date.now()}`, title, body, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type });
    });
    setMessage(title);
  }

  async function sendBillEmail(sale: Sale, to: string) {
    const response = await fetch("/api/mail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to,
        subject: `TuckQ bill ${sale.billNo}`,
        body: billText(sale),
      }),
    }).then((res) => res.json()).catch(() => ({ ok: false, status: "Offline" }));
    notify(response.sent ? "Bill emailed" : "Bill saved in mail outbox", `${sale.billNo} for ${sale.studentName}: ${response.status || "Queued"}.`, "mail");
  }

  function downloadBill(sale: Sale) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([billText(sale)], { type: "text/plain" }));
    link.download = `${sale.billNo}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function openLogin(role: Role) {
    setPortal(role);
    setLogin({ id: role === "student" ? "TISB1042" : role === "operator" ? "STAFF01" : "ADMIN01", password: role === "student" ? "student1042" : role === "operator" ? "staff123" : "admin123", name: "" });
    setScreen("login");
  }

  function signIn() {
    const id = login.id.trim().toUpperCase();
    if (portal === "student") {
      const found = state.students.find((entry) => entry.id === id);
      if (!found) return setMessage("Student login not found. Admin can create it.");
      if (found.status === "blocked") return setMessage("This student account is blocked.");
      if (found.password !== login.password) return setMessage("Incorrect student password.");
      patch((draft) => { draft.user = { role: "student", id: found.id, name: found.name }; });
      setView("student");
    } else if (portal === "operator") {
      if (login.password !== "staff123") return setMessage("Incorrect POS password.");
      patch((draft) => { draft.user = { role: "operator", id: "STAFF01", name: "Tuck Shop Staff" }; });
      setView("pos");
    } else {
      if (login.password !== "admin123") return setMessage("Incorrect admin password.");
      patch((draft) => { draft.user = { role: "admin", id: "ADMIN01", name: "School Admin" }; });
      setView("admin");
    }
    setScreen("app");
    setMessage("Signed in");
  }

  function signOut() {
    patch((draft) => { draft.user = null; });
    setScreen("home");
    setBellOpen(false);
  }

  function dailySpend(id: string) {
    return state.sales.filter((sale) => sale.studentId === id && sale.date === todayKey()).reduce((sum, sale) => sum + total(sale), 0);
  }

  function monthlySpend(id: string) {
    const prefix = todayKey().slice(0, 7);
    return state.sales.filter((sale) => sale.studentId === id && sale.date.startsWith(prefix)).reduce((sum, sale) => sum + total(sale), 0);
  }

  function bookSlot(slot: string) {
    if (!student) return setMessage("Sign in as a student first.");
    const active = state.bookings.find((booking) => booking.studentId === student.id && booking.status === "Booked");
    if (active) return setMessage("You already have a booking. Cancel it before choosing another slot.");
    const booked = state.bookings.filter((booking) => booking.slot === slot && booking.status === "Booked").length;
    if (booked >= state.slotCapacity) return setMessage("That slot is full.");
    patch((draft) => {
      draft.bookings.unshift({ id: `BK-${Date.now()}`, studentId: student.id, studentName: student.name, slot, status: "Booked", createdAt: new Date().toISOString() });
    });
    notify("Slot booked", `${slot} is booked for ${student.name}.`, "booking");
  }

  function cancelBooking(id: string) {
    patch((draft) => {
      const booking = draft.bookings.find((entry) => entry.id === id);
      if (booking) booking.status = "Cancelled";
    });
    notify("Booking cancelled", "Your tuck shop slot has been released.", "booking");
  }

  function joinQueue() {
    if (!student) return setMessage("Sign in as a student first.");
    if (!state.open || state.paused) return setMessage("Queue is not open right now. Pre-booking still works.");
    if (state.queue.some((entry) => entry.id === student.id && ["WAITING", "CALLED"].includes(entry.status))) return setMessage("You are already in the queue.");
    patch((draft) => {
      draft.queue.push({ id: student.id, name: student.name, number: draft.nextNumber, status: "WAITING", joinedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
      draft.nextNumber += 1;
    });
    notify("Joined queue", "Your queue ticket is ready.", "queue");
  }

  function callNext() {
    patch((draft) => {
      const waiting = draft.queue.filter((entry) => entry.status === "WAITING").slice(0, draft.batch);
      waiting.forEach((entry) => { entry.status = "CALLED"; });
      if (waiting.length) draft.notices.unshift({ id: `N-${Date.now()}`, title: "Next batch called", body: `${waiting.map((entry) => `#${entry.number}`).join(", ")} to the counter.`, time: "Now", type: "queue" });
    });
  }

  function markNext(status: "SERVED" | "NO SHOW") {
    patch((draft) => {
      const called = draft.queue.find((entry) => entry.status === "CALLED");
      if (called) {
        called.status = status;
        if (status === "SERVED") draft.served += 1;
      }
    });
  }

  function addToCart(item: CatalogueItem) {
    if (item.stock <= 0) return setMessage("Item is out of stock.");
    patch((draft) => {
      const line = draft.cart.find((entry) => entry.id === item.id);
      if (line) line.qty += 1;
      else draft.cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
    });
  }

  function changeQty(id: string, delta: number) {
    patch((draft) => {
      const line = draft.cart.find((entry) => entry.id === id);
      if (line) line.qty += delta;
      draft.cart = draft.cart.filter((entry) => entry.qty > 0);
    });
  }

  function addPreorderItem(item: CatalogueItem) {
    if (item.stock <= 0) return setMessage("Item is out of stock.");
    setPreorderCart((current) => {
      const existing = current.find((entry) => entry.id === item.id);
      if (existing) return current.map((entry) => entry.id === item.id ? { ...entry, qty: entry.qty + 1 } : entry);
      return [...current, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  }

  function changePreorderQty(id: string, delta: number) {
    setPreorderCart((current) => current.map((entry) => entry.id === id ? { ...entry, qty: entry.qty + delta } : entry).filter((entry) => entry.qty > 0));
  }

  function placePreorder() {
    if (!student) return setMessage("Sign in as a student first.");
    if (!preorderCart.length) return setMessage("Choose items for pre-order first.");
    const preorderTotal = preorderCart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const remainingDaily = DAILY_LIMIT - dailySpend(student.id);
    if (preorderTotal > remainingDaily) return setMessage(`Daily tuck shop limit exceeded. Remaining today: ${money(remainingDaily)}.`);
    const remainingMonthly = student.accountLimit - monthlySpend(student.id);
    if (preorderTotal > remainingMonthly) return setMessage(`Monthly account limit exceeded. Remaining: ${money(remainingMonthly)}.`);
    const sale: Sale = {
      billNo: `TQ-${todayKey().replaceAll("-", "")}-${String(state.sales.length + 1).padStart(4, "0")}`,
      date: todayKey(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      studentId: student.id,
      studentName: student.name,
      cashier: "Online pre-order",
      items: preorderCart,
    };
    patch((draft) => {
      preorderCart.forEach((line) => {
        const stock = draft.catalogue.find((item) => item.id === line.id);
        if (stock) stock.stock = Math.max(0, stock.stock - line.qty);
      });
      draft.sales.push(sale);
      draft.lastReceipt = sale;
      draft.notices.unshift({ id: `N-${Date.now()}`, title: "Pre-order placed", body: `${sale.billNo} is ready to show at pickup.`, time: "Now", type: "billing" });
    });
    setPreorderCart([]);
    void sendBillEmail(sale, student.email);
  }

  function checkout() {
    const id = posStudentId.trim().toUpperCase();
    let buyer = state.students.find((entry) => entry.id === id);
    if (!state.cart.length) return setMessage("Add items first.");
    if (!buyer && posStudentName.trim()) {
      buyer = { id, name: posStudentName.trim(), className: "Unassigned", email: `${id.toLowerCase()}@tisb.ac.in`, password: `student${id.slice(-4)}`, accountLimit: 2500, status: "active" };
    }
    if (!buyer) return setMessage("Scan ID and enter student name.");
    if (buyer.status === "blocked") return setMessage("Student account is blocked.");
    const remainingDaily = DAILY_LIMIT - dailySpend(buyer.id);
    if (cartTotal > remainingDaily) return setMessage(`Daily tuck shop limit exceeded. Remaining today: ${money(remainingDaily)}.`);
    const remainingMonthly = buyer.accountLimit - monthlySpend(buyer.id);
    if (cartTotal > remainingMonthly) return setMessage(`Monthly account limit exceeded. Remaining: ${money(remainingMonthly)}.`);
    const sale: Sale = { billNo: `TQ-${todayKey().replaceAll("-", "")}-${String(state.sales.length + 1).padStart(4, "0")}`, date: todayKey(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), studentId: buyer.id, studentName: buyer.name, cashier: state.user?.name || "Counter", items: state.cart };
    patch((draft) => {
      if (!draft.students.some((entry) => entry.id === buyer?.id) && buyer) draft.students.push(buyer);
      draft.cart.forEach((line) => {
        const stock = draft.catalogue.find((item) => item.id === line.id);
        if (stock) stock.stock = Math.max(0, stock.stock - line.qty);
      });
      draft.sales.push(sale);
      draft.lastReceipt = sale;
      draft.cart = [];
      draft.notices.unshift({ id: `N-${Date.now()}`, title: "Bill created", body: `${buyer!.name} charged ${money(total(sale))}. Receipt notification queued.`, time: "Now", type: "billing" });
    });
    void sendBillEmail(sale, buyer.email);
    setMessage(`Bill ${sale.billNo} created.`);
  }

  function createStudent() {
    const id = newStudent.id.trim().toUpperCase();
    if (!id || !newStudent.name.trim() || !newStudent.password.trim()) return setMessage("ID, name and password are required.");
    patch((draft) => {
      const existing = draft.students.find((entry) => entry.id === id);
      const studentRecord: Student = {
        id,
        name: newStudent.name.trim(),
        className: newStudent.className.trim() || "Unassigned",
        email: newStudent.email.trim() || `${id.toLowerCase()}@tisb.ac.in`,
        password: newStudent.password.trim(),
        accountLimit: Number(newStudent.limit) || 2500,
        status: "active",
      };
      if (existing) Object.assign(existing, studentRecord);
      else draft.students.unshift(studentRecord);
    });
    setNewStudent({ id: "", name: "", className: "", email: "", password: "", limit: "2500" });
    setMessage("Student login saved.");
  }

  function importStudents() {
    const lines = importText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    patch((draft) => {
      lines.forEach((line) => {
        const [idRaw, nameRaw, classRaw] = line.split(",").map((part) => part.trim());
        const id = idRaw?.toUpperCase();
        if (!id || !nameRaw || draft.students.some((entry) => entry.id === id)) return;
        draft.students.push({ id, name: nameRaw, className: classRaw || "Unassigned", email: `${id.toLowerCase()}@tisb.ac.in`, password: `student${id.slice(-4)}`, accountLimit: 2500, status: "active" });
      });
    });
    setImportText("");
    setMessage("Student import complete.");
  }

  function addItem() {
    if (!newItem.name.trim()) return setMessage("Enter item name.");
    patch((draft) => {
      draft.catalogue.unshift({ id: `item-${Date.now()}`, day: newItem.day, name: newItem.name.trim(), category: newItem.category, price: Number(newItem.price) || 40, stock: 40 });
    });
    setNewItem({ name: "", price: "40", day: "Everyday", category: "Snack" });
    setMessage("Menu item added.");
  }

  function downloadReport(kind: "sales" | "ledger" | "inventory" | "queue") {
    const rows =
      kind === "sales"
        ? [["bill_no", "date", "student_id", "student", "items", "total"], ...state.sales.map((sale) => [sale.billNo, sale.date, sale.studentId, sale.studentName, sale.items.map((item) => `${item.qty}x ${item.name}`).join("; "), total(sale)])]
        : kind === "ledger"
          ? [["student_id", "name", "daily_spend", "daily_limit", "monthly_spend", "monthly_limit"], ...state.students.map((entry) => [entry.id, entry.name, dailySpend(entry.id), DAILY_LIMIT, monthlySpend(entry.id), entry.accountLimit])]
          : kind === "inventory"
            ? [["item", "day", "category", "price", "stock"], ...state.catalogue.map((item) => [item.name, item.day, item.category, item.price, item.stock])]
            : [["student_id", "name", "slot", "status"], ...state.bookings.map((booking) => [booking.studentId, booking.studentName, booking.slot, booking.status])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `tuckq-${kind}-${todayKey()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const allowedViews: View[] = state.user?.role === "admin" ? ["admin", "pos", "operator", "account", "import"] : state.user?.role === "operator" ? ["pos", "operator"] : ["student", "account"];

  return (
    <main className="shell">
      {screen === "home" && (
        <section className="home">
          <header className="brandRow">
            <div className="brand">
              <img src="https://www.tisb.org/assets/img/logo.png" alt="TISB crest" />
              <div>
                <b>TuckQ</b>
                <span>TISB Tuck Shop</span>
              </div>
            </div>
          </header>
          <div className="heroGrid">
            <section className="heroCopy">
              <p className="eyebrow">The International School Bangalore</p>
              <h1>Student tuck shop slots, billing, and queue updates.</h1>
              <p>Students can pre-book, cancel slots, join the queue, and track daily, weekly, and monthly tuck shop spend with a ₹280 daily purchase limit.</p>
            </section>
            <section className="loginHero">
              <button className="studentLogin" onClick={() => openLogin("student")}>
                <span>Student Portal Login</span>
                <small>Book 3:45-4:45 slots and check account billing</small>
              </button>
              <div className="smallLinks">
                <button onClick={() => openLogin("operator")}>POS / Operator login</button>
                <button onClick={() => openLogin("admin")}>School admin login</button>
              </div>
            </section>
          </div>
        </section>
      )}

      {screen === "login" && (
        <section className="loginPage">
          <div className="loginPanel">
            <button className="textBtn" onClick={() => setScreen("home")}>Back</button>
            <p className="eyebrow">{portalCopy[portal][0]}</p>
            <h2>{portalCopy[portal][1]}</h2>
            <label>ID card / user ID<input value={login.id} onChange={(event) => setLogin({ ...login, id: event.target.value })} /></label>
            <label>Password<input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
            <button className="primary" onClick={signIn}>Login to TuckQ</button>
          </div>
        </section>
      )}

      {screen === "app" && (
        <section className="app">
          <header className="appTop">
            <div className="brand compact">
              <img src="https://www.tisb.org/assets/img/logo.png" alt="TISB crest" />
              <div><b>TuckQ</b><span>{state.user?.name}</span></div>
            </div>
            <nav>{allowedViews.map((item) => <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>{item}</button>)}</nav>
            <div className="topActions">
              <button className="bell" onClick={() => { setBellOpen(!bellOpen); patch((draft) => draft.notices.forEach((notice) => { notice.read = true; })); }}>🔔{unread > 0 && <span>{unread}</span>}</button>
              <button className="ghost" onClick={signOut}>Logout</button>
            </div>
            {bellOpen && (
              <aside className="noticePanel">
                <h3>Notifications</h3>
                {state.notices.slice(0, 8).map((notice) => <div className="notice" key={notice.id}><b>{notice.title}</b><span>{notice.body}</span><small>{notice.time}</small></div>)}
              </aside>
            )}
          </header>

          <p className="toast">{message}</p>

          {view === "student" && student && (
            <section className="grid two">
              <Panel title="Book a slot" badge="3:45-4:45 PM">
                <div className="slotGrid">
                  {slotLabels(state.slotIncrement).map((slot) => {
                    const existing = state.bookings.find((booking) => booking.studentId === student.id && booking.slot === slot && booking.status === "Booked");
                    const filled = state.bookings.filter((booking) => booking.slot === slot && booking.status === "Booked").length;
                    return <button className={existing ? "slot selected" : "slot"} key={slot} onClick={() => existing ? cancelBooking(existing.id) : bookSlot(slot)}><b>{slot}</b><span>{existing ? "Cancel booking" : `${state.slotCapacity - filled} left`}</span></button>;
                  })}
                </div>
              </Panel>
              <Panel title="Live queue" badge={state.open ? "Open" : "Pre-booking"}>
                <div className="metricRow"><Metric label="Waiting" value={state.queue.filter((entry) => entry.status === "WAITING").length} /><Metric label="Called" value={state.queue.filter((entry) => entry.status === "CALLED").length} /><Metric label="Served" value={state.served} /></div>
                <button className="primary" onClick={joinQueue} disabled={!state.open || state.paused}>Join live queue</button>
                <h3>Today&apos;s menu</h3>
                <div className="miniList">{dayItems.slice(0, 8).map((item) => <span key={item.id}>{item.name} <b>{money(item.price)}</b></span>)}</div>
              </Panel>
              <Panel title="Same-day pre-order" badge="Bill by email">
                <p className="muted">Pre-order is available only for today&apos;s tuck shop menu. Show the online bill number at pickup.</p>
                <div className="items compactItems">{dayItems.slice(0, 10).map((item) => <button key={item.id} onClick={() => addPreorderItem(item)}><b>{item.name}</b><span>{item.category} · {money(item.price)} · {item.stock} left</span></button>)}</div>
                {preorderCart.length ? preorderCart.map((line) => <div className="cartLine" key={line.id}><span>{line.qty} x {line.name} @ {money(line.price)}</span><b>{money(line.qty * line.price)}</b><button onClick={() => changePreorderQty(line.id, -1)}>-</button><button onClick={() => changePreorderQty(line.id, 1)}>+</button></div>) : <p className="muted">No pre-order items selected.</p>}
                <button className="primary" onClick={placePreorder}>Place pre-order and email bill</button>
              </Panel>
            </section>
          )}

          {view === "pos" && (
            <section className="grid posGrid">
              <Panel title="Billing" badge={`${money(DAILY_LIMIT)} daily cap`}>
                <div className="formRow"><input placeholder="Scan ID card" value={posStudentId} onChange={(event) => setPosStudentId(event.target.value.toUpperCase())} /><input placeholder="Student name if new" value={posStudentName} onChange={(event) => setPosStudentName(event.target.value)} /></div>
                <div className="formRow"><select value={state.selectedPosDay} onChange={(event) => patch((draft) => { draft.selectedPosDay = event.target.value; })}>{DAYS.map((day) => <option key={day}>{day}</option>)}</select><input placeholder="Search items" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
                <div className="items">{filteredItems.map((item) => <button key={item.id} onClick={() => addToCart(item)}><b>{item.name}</b><span>{item.category} · {money(item.price)} · {item.stock} left</span></button>)}</div>
              </Panel>
              <Panel title="Bill" badge={money(cartTotal)}>
                {state.cart.length ? state.cart.map((line) => <div className="cartLine" key={line.id}><span>{line.qty} x {line.name}</span><b>{money(line.qty * line.price)}</b><button onClick={() => changeQty(line.id, -1)}>-</button><button onClick={() => changeQty(line.id, 1)}>+</button></div>) : <p className="muted">Cart is empty.</p>}
                <button className="primary" onClick={checkout}>Charge student account</button>
                <button className="ghost" onClick={() => window.print()}>Print bill</button>
                <div className="receipt">{state.lastReceipt ? <><h3>TISB Tuck Shop</h3><p>{state.lastReceipt.billNo}</p>{state.lastReceipt.items.map((item) => <div key={item.id}>{item.qty} x {item.name}<b>{money(item.qty * item.price)}</b></div>)}<strong>Total {money(total(state.lastReceipt))}</strong></> : "Receipt appears after checkout."}</div>
              </Panel>
            </section>
          )}

          {view === "operator" && (
            <section className="grid two">
              <Panel title="Queue controls" badge={state.open ? "Open" : "Closed"}>
                <div className="actions"><button className="primary" onClick={() => patch((draft) => { draft.open = !draft.open; })}>{state.open ? "Close" : "Open"} tuck shop</button><button className="ghost" onClick={() => patch((draft) => { draft.paused = !draft.paused; })}>{state.paused ? "Resume" : "Pause"}</button><button onClick={callNext}>Call next {state.batch}</button><button onClick={() => markNext("SERVED")}>Serve</button><button onClick={() => markNext("NO SHOW")}>No show</button></div>
              </Panel>
              <Panel title="Queue board" badge={`${state.queue.length} tickets`}>
                <Table headers={["No", "Student", "Status"]} rows={state.queue.slice(0, 12).map((entry) => [`#${entry.number}`, entry.name, entry.status])} />
              </Panel>
            </section>
          )}

          {view === "account" && (
            <section className="grid two">
              <Panel title="Student account" badge={student ? student.id : "All"}>
                <div className="metricRow"><Metric label="Today" value={money(student ? dailySpend(student.id) : 0)} /><Metric label="Left today" value={money(student ? DAILY_LIMIT - dailySpend(student.id) : DAILY_LIMIT)} /><Metric label="Month left" value={money(student ? student.accountLimit - monthlySpend(student.id) : 0)} /></div>
              </Panel>
              <Panel title="Recent bills" badge={`${state.sales.length} bills`}>
                <div className="billList">
                  {state.sales.filter((sale) => !student || sale.studentId === student.id).slice(-10).reverse().map((sale) => (
                    <article className="billCard" key={sale.billNo}>
                      <header><b>{sale.billNo}</b><span>{sale.date} · {sale.cashier}</span></header>
                      {sale.items.map((item) => <p key={item.id}>{item.qty} x {item.name} @ {money(item.price)} <b>{money(item.qty * item.price)}</b></p>)}
                      <footer><strong>Total {money(total(sale))}</strong><button className="ghost" onClick={() => downloadBill(sale)}>Download bill</button></footer>
                    </article>
                  ))}
                  {!state.sales.filter((sale) => !student || sale.studentId === student.id).length && <p className="muted">No bills yet.</p>}
                </div>
              </Panel>
            </section>
          )}

          {view === "import" && (
            <section className="grid two">
              <Panel title="Import students" badge="ID, Name">
                <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={"TISB2001, Student Name, Grade 8\nTISB2002, Another Name, Grade 9"} />
                <button className="primary" onClick={importStudents}>Import roster</button>
              </Panel>
              <Panel title="Roster" badge={`${state.students.length} students`}><Table headers={["ID", "Name", "Class"]} rows={state.students.slice(0, 14).map((entry) => [entry.id, entry.name, entry.className])} /></Panel>
            </section>
          )}

          {view === "admin" && (
            <section className="grid adminGrid">
              <Panel title="Create student login" badge="ID + password">
                <div className="formStack">
                  <input placeholder="ID card number" value={newStudent.id} onChange={(event) => setNewStudent({ ...newStudent, id: event.target.value })} />
                  <input placeholder="Student name" value={newStudent.name} onChange={(event) => setNewStudent({ ...newStudent, name: event.target.value })} />
                  <input placeholder="Class / House" value={newStudent.className} onChange={(event) => setNewStudent({ ...newStudent, className: event.target.value })} />
                  <input placeholder="Email" value={newStudent.email} onChange={(event) => setNewStudent({ ...newStudent, email: event.target.value })} />
                  <input placeholder="Password" value={newStudent.password} onChange={(event) => setNewStudent({ ...newStudent, password: event.target.value })} />
                  <button className="primary" onClick={createStudent}>Save login</button>
                </div>
              </Panel>
              <Panel title="Settings" badge="TuckQ">
                <div className="formStack">
                  <label>Slot increment<select value={state.slotIncrement} onChange={(event) => patch((draft) => { draft.slotIncrement = Number(event.target.value); })}><option value={5}>5 minutes</option><option value={10}>10 minutes</option></select></label>
                  <label>Slot capacity<input type="number" value={state.slotCapacity} onChange={(event) => patch((draft) => { draft.slotCapacity = Number(event.target.value) || 18; })} /></label>
                  <label>Batch size<input type="number" value={state.batch} onChange={(event) => patch((draft) => { draft.batch = Number(event.target.value) || 5; })} /></label>
                </div>
              </Panel>
              <Panel title="Reports" badge="CSV downloads">
                <div className="reportGrid"><button onClick={() => downloadReport("sales")}>Sales report</button><button onClick={() => downloadReport("ledger")}>Ledger report</button><button onClick={() => downloadReport("inventory")}>Inventory report</button><button onClick={() => downloadReport("queue")}>Bookings report</button></div>
              </Panel>
              <Panel title="Add POS item" badge="Day-wise">
                <div className="formStack"><input placeholder="Item name" value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} /><input placeholder="Price" value={newItem.price} onChange={(event) => setNewItem({ ...newItem, price: event.target.value })} /><select value={newItem.day} onChange={(event) => setNewItem({ ...newItem, day: event.target.value })}><option>Everyday</option>{DAYS.map((day) => <option key={day}>{day}</option>)}</select><button className="primary" onClick={addItem}>Add item</button></div>
              </Panel>
            </section>
          )}
        </section>
      )}
    </main>
  );
}

function Panel({ title, badge, children }: { title: string; badge: string; children: React.ReactNode }) {
  return <section className="panel"><header><h2>{title}</h2><span>{badge}</span></header>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><b>{value}</b><span>{label}</span></div>;
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return <table><thead><tr>{headers.map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>No records yet.</td></tr>}</tbody></table>;
}
