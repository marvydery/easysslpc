import { pgTable, uuid, varchar, timestamp, boolean, text, pgEnum, integer, unique } from "drizzle-orm/pg-core";
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
  validationMethod: varchar("validation_method", { length: 50 }),
  challengeToken: varchar("challenge_token", { length: 255 }),
  challengeValue: text("challenge_value"),
  bridgeSecret: varchar("bridge_secret", { length: 255 }),
  nextRenewalDate: timestamp("next_renewal_date"),
  autoRenewEnabled: boolean("auto_renew_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ACME Challenges Table
export const acmeChallenges = pgTable(
  "acme_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    token: text("token").notNull(),
    keyAuthorization: text("key_authorization").notNull(),
    orderUrl: text("order_url").notNull(),
    accountKeyPem: text("account_key_pem").notNull(),
    csrKeyPem: text("csr_key_pem").notNull(),
    csrDer: text("csr_der").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userDomainUnique: unique().on(table.userId, table.domain),
    tokenIdx: unique().on(table.token),
  })
);

// Certificates Table
export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
  crtBody: text("crt_body").notNull(),
  keyBodyEncrypted: text("key_body_encrypted").notNull(),
  caBundle: text("ca_bundle"),
  expiryDate: timestamp("expiry_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  domains: many(domains),
  acmeChallenges: many(acmeChallenges),
}));

export const domainsRelations = relations(domains, ({ one, many }) => ({
  user: one(users, {
    fields: [domains.userId],
    references: [users.id],
  }),
  certificates: many(certificates),
}));

export const acmeChallengesRelations = relations(acmeChallenges, ({ one }) => ({
  user: one(users, {
    fields: [acmeChallenges.userId],
    references: [users.id],
  }),
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
export type AcmeChallenge = typeof acmeChallenges.$inferSelect;
export type NewAcmeChallenge = typeof acmeChallenges.$inferInsert;
export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;