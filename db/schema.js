import {pgTable,serial,varchar,text,integer,timestamp,numeric,pgEnum,} from "drizzle-orm/pg-core";

export const transactionType = pgEnum("transaction_type", ["income", "outcome"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 256 }).notNull().unique(),
  password: varchar("password", { length: 256 }).notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  nominal: numeric("nominal", { precision: 15, scale: 2 }).notNull(),
  transactionDate: timestamp("transaction_date", { mode: "string" }).notNull(),
  status: transactionType("status").notNull(),
  description: text("description"),
});
