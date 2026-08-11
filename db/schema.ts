import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  ...timestamps,
});

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [uniqueIndex("profiles_user_id_idx").on(table.userId)]);

export const profileFields = sqliteTable("profile_fields", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => profiles.id),
  path: text("path").notNull(),
  label: text("label").notNull(),
  valueJson: text("value_json"),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("profile_fields_profile_path_idx").on(table.profileId, table.path)]);

export const experiences = sqliteTable("experiences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  situation: text("situation").notNull(),
  actionsJson: text("actions_json").notNull(),
  resultsJson: text("results_json").notNull(),
  themesJson: text("themes_json").notNull(),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull(),
  ...timestamps,
}, (table) => [index("experiences_user_verified_idx").on(table.userId, table.verified)]);

export const scholarships = sqliteTable("scholarships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  deadline: text("deadline"),
  ...timestamps,
});

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  scholarshipId: integer("scholarship_id").notNull().references(() => scholarships.id),
  status: text("status").notNull().default("started"),
  fieldsCompleted: integer("fields_completed").notNull().default(0),
  fieldsTotal: integer("fields_total").notNull().default(0),
  missingFields: integer("missing_fields").notNull().default(0),
  ...timestamps,
}, (table) => [index("applications_user_updated_idx").on(table.userId, table.updatedAt)]);

export const applicationFields = sqliteTable("application_fields", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").notNull().references(() => applications.id),
  fieldId: text("field_id").notNull(),
  label: text("label").notNull(),
  fieldType: text("field_type").notNull(),
  action: text("action").notNull(),
  confidence: real("confidence").notNull(),
  source: text("source"),
  answer: text("answer").notNull().default(""),
  approved: integer("approved", { mode: "boolean" }).notNull().default(false),
  reason: text("reason").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("application_fields_application_field_idx").on(table.applicationId, table.fieldId)]);

export const generatedAnswers = sqliteTable("generated_answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationFieldId: integer("application_field_id").notNull().references(() => applicationFields.id),
  draft: text("draft").notNull(),
  experiencesUsedJson: text("experiences_used_json").notNull(),
  factsUsedJson: text("facts_used_json").notNull(),
  requiresReview: integer("requires_review", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  storageKey: text("storage_key"),
  status: text("status").notNull().default("manual_only"),
  ...timestamps,
});
