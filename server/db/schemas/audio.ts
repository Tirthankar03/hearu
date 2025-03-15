import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";

export const audiosTable = pgTable("audios", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // "Breath", "Meditation", "Sleep Stories", "Sleep Sounds"
  title: text("title").notNull(),
  url: text("url").notNull(), // URL to the audio file
  duration: integer("duration"), // Duration in seconds, optional
});