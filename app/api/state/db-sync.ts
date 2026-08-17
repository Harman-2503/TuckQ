import { env } from "cloudflare:workers";

type AnyRecord = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "");
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function saleTotal(sale: AnyRecord) {
  const items = Array.isArray(sale.items) ? sale.items : [];
  return items.reduce((sum, item) => {
    const row = item as AnyRecord;
    return sum + number(row.price) * number(row.qty, 1);
  }, 0);
}

export async function ensureTuckQDatabase() {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_state_updated_at ON tuckq_state (updated_at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_students (id TEXT PRIMARY KEY, name TEXT NOT NULL, class_name TEXT, email TEXT, card_uid TEXT, password TEXT, account_limit INTEGER NOT NULL DEFAULT 2500, status TEXT NOT NULL DEFAULT 'active', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_students_status ON tuckq_students (status)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_catalogue (id TEXT PRIMARY KEY, day TEXT NOT NULL, name TEXT NOT NULL, category TEXT, price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_catalogue_day ON tuckq_catalogue (day)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_queue (number INTEGER PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL, joined TEXT, wait TEXT, status TEXT NOT NULL, slot TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_queue_status ON tuckq_queue (status)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_bookings (student_id TEXT PRIMARY KEY, student_name TEXT NOT NULL, slot TEXT NOT NULL, ticket INTEGER, created TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_bookings_slot ON tuckq_bookings (slot)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_sales (bill_no TEXT PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL, cashier TEXT, channel TEXT, pickup_status TEXT, date TEXT, time TEXT, iso TEXT, total INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_sales_student_date ON tuckq_sales (student_id, date)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_sales_date ON tuckq_sales (date)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_sale_items (id TEXT PRIMARY KEY, bill_no TEXT NOT NULL, item_id TEXT, item_name TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1, price INTEGER NOT NULL, total INTEGER NOT NULL, FOREIGN KEY (bill_no) REFERENCES tuckq_sales (bill_no))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_sale_items_bill_no ON tuckq_sale_items (bill_no)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_preorders (bill_no TEXT PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL, pickup_slot TEXT, status TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, items_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_preorders_status ON tuckq_preorders (status)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_mail_events (id TEXT PRIMARY KEY, date TEXT, time TEXT, to_email TEXT, student_id TEXT, student_name TEXT, subject TEXT, body TEXT, type TEXT, status TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_mail_events_student_id ON tuckq_mail_events (student_id)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  ]);
  await ensureColumn("tuckq_students", "card_uid", "TEXT");
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_students_card_uid ON tuckq_students (card_uid)").run();
}

async function ensureColumn(table: string, column: string, definition: string) {
  const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name?: string }>();
  const exists = result.results?.some((row) => row.name === column);
  if (!exists) await env.DB.prepare(`ALTER TABLE ${table} ADD ${column} ${definition}`).run();
}

export async function saveStructuredState(state: unknown) {
  const source = (state ?? {}) as AnyRecord;
  const students = Array.isArray(source.students) ? source.students as AnyRecord[] : [];
  const catalogue = Array.isArray(source.catalogue) ? source.catalogue as AnyRecord[] : [];
  const queue = Array.isArray(source.queue) ? source.queue as AnyRecord[] : [];
  const bookings = Array.isArray(source.bookings) ? source.bookings as AnyRecord[] : [];
  const sales = Array.isArray(source.sales) ? source.sales as AnyRecord[] : [];
  const preorders = Array.isArray(source.preorders) ? source.preorders as AnyRecord[] : [];
  const mailOutbox = Array.isArray(source.mailOutbox) ? source.mailOutbox as AnyRecord[] : [];

  const statements = [
    env.DB.prepare("DELETE FROM tuckq_students"),
    env.DB.prepare("DELETE FROM tuckq_catalogue"),
    env.DB.prepare("DELETE FROM tuckq_queue"),
    env.DB.prepare("DELETE FROM tuckq_bookings"),
    env.DB.prepare("DELETE FROM tuckq_sale_items"),
    env.DB.prepare("DELETE FROM tuckq_sales"),
    env.DB.prepare("DELETE FROM tuckq_preorders"),
    env.DB.prepare("DELETE FROM tuckq_mail_events"),
    env.DB.prepare("DELETE FROM tuckq_settings"),
  ];

  for (const student of students) {
    statements.push(env.DB.prepare("INSERT INTO tuckq_students (id, name, class_name, email, card_uid, password, account_limit, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(text(student.id), text(student.name), text(student.className), text(student.email), text(student.cardUid), text(student.password), number(student.accountLimit, 2500), text(student.status || "active")));
  }

  for (const item of catalogue) {
    statements.push(env.DB.prepare("INSERT INTO tuckq_catalogue (id, day, name, category, price, stock) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(text(item.id), text(item.day), text(item.name), text(item.category), number(item.price), number(item.stock)));
  }

  for (const entry of queue) {
    statements.push(env.DB.prepare("INSERT INTO tuckq_queue (number, student_id, student_name, joined, wait, status, slot) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(number(entry.number), text(entry.id), text(entry.name), text(entry.joined), text(entry.wait), text(entry.status), text(entry.slot)));
  }

  for (const booking of bookings) {
    statements.push(env.DB.prepare("INSERT INTO tuckq_bookings (student_id, student_name, slot, ticket, created) VALUES (?, ?, ?, ?, ?)")
      .bind(text(booking.id), text(booking.name), text(booking.slot), number(booking.ticket), text(booking.created)));
  }

  for (const sale of sales) {
    const total = saleTotal(sale);
    statements.push(env.DB.prepare("INSERT INTO tuckq_sales (bill_no, student_id, student_name, cashier, channel, pickup_status, date, time, iso, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(text(sale.billNo), text(sale.studentId), text(sale.studentName), text(sale.cashier), text(sale.channel), text(sale.pickupStatus), text(sale.date), text(sale.time), text(sale.iso), total));
    const items = Array.isArray(sale.items) ? sale.items as AnyRecord[] : [];
    items.forEach((item, index) => {
      const qty = number(item.qty, 1);
      const price = number(item.price);
      statements.push(env.DB.prepare("INSERT INTO tuckq_sale_items (id, bill_no, item_id, item_name, qty, price, total) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(`${text(sale.billNo)}-${index + 1}`, text(sale.billNo), text(item.id), text(item.name), qty, price, qty * price));
    });
  }

  for (const preorder of preorders) {
    statements.push(env.DB.prepare("INSERT INTO tuckq_preorders (bill_no, student_id, student_name, pickup_slot, status, total, items_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(text(preorder.billNo), text(preorder.studentId), text(preorder.studentName), text(preorder.pickupSlot), text(preorder.status), number(preorder.total), json(preorder.items)));
  }

  for (const mail of mailOutbox) {
    statements.push(env.DB.prepare("INSERT INTO tuckq_mail_events (id, date, time, to_email, student_id, student_name, subject, body, type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(text(mail.id || `MAIL-${Date.now()}-${Math.random().toString(16).slice(2)}`), text(mail.date), text(mail.time), text(mail.to), text(mail.studentId), text(mail.studentName), text(mail.subject), text(mail.body), text(mail.type), text(mail.status)));
  }

  const settings = {
    open: Boolean(source.open),
    paused: Boolean(source.paused),
    batch: number(source.batch, 5),
    slotIncrement: number(source.slotIncrement, 10),
    slotCapacity: number(source.slotCapacity, 18),
    nextNumber: number(source.nextNumber, 36),
    selectedPosDay: text(source.selectedPosDay),
    preorderDay: text(source.preorderDay),
  };

  for (const [key, value] of Object.entries(settings)) {
    statements.push(env.DB.prepare("INSERT INTO tuckq_settings (key, value) VALUES (?, ?)")
      .bind(key, json(value)));
  }

  while (statements.length) {
    await env.DB.batch(statements.splice(0, 80));
  }
}
