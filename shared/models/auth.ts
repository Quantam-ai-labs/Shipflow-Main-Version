import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, boolean, text } from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  passwordHash: varchar("password_hash", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().default("USER"),
  isActive: boolean("is_active").notNull().default(true),
  merchantId: varchar("merchant_id"),
  sidebarMode: varchar("sidebar_mode", { length: 20 }).notNull().default("advanced"),
  sidebarPinnedPages: text("sidebar_pinned_pages").array(),
  setupToken: varchar("setup_token", { length: 255 }),
  setupTokenExpiresAt: timestamp("setup_token_expires_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
