import { pgTable, uuid, varchar, timestamp, boolean, text, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const subscriptionTierEnum = pgEnum("subscription_tier", ["free", "pro", "lifetime"]);

// Users Table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  clerkId: varchar("clerk_id", { length: 255 }).notNull().unique(),
  subscriptionTier: subscriptionTierEnum("subscription_tier").notNull().default("free"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Domains Table
export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domainName: varchar("domain_name", { length: 255 }).notNull(),
  validationMethod: varchar("validation_method", { length: 50 }), // 'dns-01' or 'http-01'
  challengeToken: varchar("challenge_token", { length: 255 }),
  challengeValue: text("challenge_value"),
  bridgeSecret: varchar("bridge_secret", { length: 255 }),
  nextRenewalDate: timestamp("next_renewal_date"),
  autoRenewEnabled: boolean("auto_renew_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Certificates Table
export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
  crtBody: text("crt_body").notNull(),
  keyBodyEncrypted: text("key_body_encrypted").notNull(), // AES-256 encrypted
  caBundle: text("ca_bundle"),
  expiryDate: timestamp("expiry_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  domains: many(domains),
}));

export const domainsRelations = relations(domains, ({ one, many }) => ({
  user: one(users, {
    fields: [domains.userId],
    references: [users.id],
  }),
  certificates: many(certificates),
}));

export const certificatesRelations = relations(certificates, ({ one }) => ({
  domain: one(domains, {
    fields: [certificates.domainId],
    references: [domains.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
