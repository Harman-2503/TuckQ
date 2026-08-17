import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tuckqState = sqliteTable("tuckq_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuckqStudents = sqliteTable("tuckq_students", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  className: text("class_name"),
  email: text("email"),
  cardUid: text("card_uid"),
  password: text("password"),
  accountLimit: integer("account_limit").notNull().default(2500),
  status: text("status").notNull().default("active"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuckqCatalogue = sqliteTable("tuckq_catalogue", {
  id: text("id").primaryKey(),
  day: text("day").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  price: integer("price").notNull(),
  stock: integer("stock").notNull().default(0),
  purchaseLimit: integer("purchase_limit").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuckqQueue = sqliteTable("tuckq_queue", {
  number: integer("number").primaryKey(),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull(),
  joined: text("joined"),
  wait: text("wait"),
  status: text("status").notNull(),
  slot: text("slot"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuckqBookings = sqliteTable("tuckq_bookings", {
  studentId: text("student_id").primaryKey(),
  studentName: text("student_name").notNull(),
  slot: text("slot").notNull(),
  ticket: integer("ticket"),
  created: text("created"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuckqSales = sqliteTable("tuckq_sales", {
  billNo: text("bill_no").primaryKey(),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull(),
  cashier: text("cashier"),
  channel: text("channel"),
  pickupStatus: text("pickup_status"),
  date: text("date"),
  time: text("time"),
  iso: text("iso"),
  total: integer("total").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuckqSaleItems = sqliteTable("tuckq_sale_items", {
  id: text("id").primaryKey(),
  billNo: text("bill_no").notNull(),
  itemId: text("item_id"),
  itemName: text("item_name").notNull(),
  qty: integer("qty").notNull().default(1),
  price: integer("price").notNull(),
  total: integer("total").notNull(),
});

export const tuckqPreorders = sqliteTable("tuckq_preorders", {
  billNo: text("bill_no").primaryKey(),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull(),
  pickupSlot: text("pickup_slot"),
  status: text("status").notNull(),
  total: integer("total").notNull().default(0),
  itemsJson: text("items_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuckqMailEvents = sqliteTable("tuckq_mail_events", {
  id: text("id").primaryKey(),
  date: text("date"),
  time: text("time"),
  toEmail: text("to_email"),
  studentId: text("student_id"),
  studentName: text("student_name"),
  subject: text("subject"),
  body: text("body"),
  type: text("type"),
  status: text("status"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuckqSettings = sqliteTable("tuckq_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
