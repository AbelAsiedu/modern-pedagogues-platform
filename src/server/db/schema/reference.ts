import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./identity";

// Configurable academic structure. Nothing about curricula, levels or subjects is hard-coded in the UI.

export const curricula = pgTable("curricula", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  summary: text("summary"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const academicLevels = pgTable("academic_levels", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  /** Grouping label, for example "primary" or "senior_high". */
  stage: text("stage").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const subjects = pgTable("subjects", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});
