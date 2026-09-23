import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// --- shared enums ---------------------------------------------------------

export const appRole = pgEnum("app_role", ["her", "him"]);

// One category per shareable data type. Each maps 1:1 to a table's RLS policy,
// except `fertile_window` which is derived (Phase 3) and gated at query time.
export const consentCategory = pgEnum("consent_category", [
  "cycle",
  "bbt",
  "opk",
  "mucus",
  "symptom",
  "habit",
  "fertile_window",
]);

const ownerId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

// --- people & links -------------------------------------------------------

export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  role: appRole("role"),
  pushToken: text("push_token"), // Expo push token for discreet notifications (Phase 9)
  ...timestamps,
});

export const couple = pgTable(
  "couple",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberA: text("member_a")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    memberB: text("member_b")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("couple_members_uidx").on(t.memberA, t.memberB)],
);

// The privacy engine's source of truth. Default-OFF: absence of a granted row = no access.
export const sharingConsent = pgTable(
  "sharing_consent",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    coupleId: uuid("couple_id")
      .notNull()
      .references(() => couple.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    category: consentCategory("category").notNull(),
    granted: boolean("granted").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("sharing_consent_uidx").on(t.coupleId, t.ownerId, t.category)],
);

// --- her daily logs (one row per day) -------------------------------------

export const cycleLog = pgTable(
  "cycle_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: ownerId(),
    date: date("date").notNull(),
    flow: text("flow"), // spotting | light | medium | heavy
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("cycle_log_user_date_uidx").on(t.userId, t.date)],
);

export const bbtLog = pgTable(
  "bbt_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: ownerId(),
    date: date("date").notNull(),
    tempC: numeric("temp_c", { precision: 4, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("bbt_log_user_date_uidx").on(t.userId, t.date)],
);

export const opkLog = pgTable(
  "opk_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: ownerId(),
    date: date("date").notNull(),
    result: text("result"), // low | high | peak | positive | negative
    photoPath: text("photo_path"), // private storage key
    ...timestamps,
  },
  (t) => [uniqueIndex("opk_log_user_date_uidx").on(t.userId, t.date)],
);

export const mucusLog = pgTable(
  "mucus_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: ownerId(),
    date: date("date").notNull(),
    type: text("type"), // dry | sticky | creamy | watery | eggwhite
    ...timestamps,
  },
  (t) => [uniqueIndex("mucus_log_user_date_uidx").on(t.userId, t.date)],
);

export const symptomLog = pgTable(
  "symptom_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: ownerId(),
    date: date("date").notNull(),
    symptoms: jsonb("symptoms").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("symptom_log_user_date_uidx").on(t.userId, t.date)],
);

// --- his daily log --------------------------------------------------------

export const habitLog = pgTable(
  "habit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: ownerId(),
    date: date("date").notNull(),
    alcoholUnits: integer("alcohol_units"),
    cigarettes: integer("cigarettes"),
    exerciseMinutes: integer("exercise_minutes"),
    sleepHours: numeric("sleep_hours", { precision: 3, scale: 1 }),
    heatExposure: boolean("heat_exposure"),
    stressLevel: integer("stress_level"), // 1-5
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("habit_log_user_date_uidx").on(t.userId, t.date)],
);

// --- shared / paid --------------------------------------------------------

export const todo = pgTable("todo", {
  id: uuid("id").defaultRandom().primaryKey(),
  coupleId: uuid("couple_id")
    .notNull()
    .references(() => couple.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  ...timestamps,
});

// Phase 6 — single-use, expiring partner invite. Accepting it (server-side)
// creates the couple and writes the consent rows the inviter chose.
export const invite = pgTable("invite", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: text("token").notNull().unique(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Which of the inviter's categories to share once accepted.
  categories: jsonb("categories").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coaching = pgTable("coaching", {
  id: uuid("id").defaultRandom().primaryKey(),
  coupleId: uuid("couple_id")
    .notNull()
    .references(() => couple.id, { onDelete: "cascade" }),
  userId: ownerId(), // recipient
  ruleId: text("rule_id").notNull(),
  ruleVersion: integer("rule_version").notNull(),
  priority: integer("priority").notNull().default(0),
  body: text("body").notNull(),
  weekOf: date("week_of").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const entitlement = pgTable(
  "entitlement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: ownerId(),
    product: text("product").notNull(),
    isPro: boolean("is_pro").notNull().default(false),
    status: text("status"),
    expiresAt: timestamp("expires_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("entitlement_user_product_uidx").on(t.userId, t.product)],
);
