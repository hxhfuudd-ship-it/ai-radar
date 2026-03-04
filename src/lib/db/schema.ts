import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  fullName: text('full_name').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  stars: integer('stars').default(0),
  forks: integer('forks').default(0),
  language: text('language'),
  topics: text('topics'),
  readme: text('readme'),
  summary: text('summary'),
  analysis: text('analysis'),
  score: real('score'),
  repoCreatedAt: text('repo_created_at'),
  repoUpdatedAt: text('repo_updated_at'),
  discoveredAt: text('discovered_at').notNull(),
  analyzedAt: text('analyzed_at'),
});

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const projectTags = sqliteTable('project_tags', {
  projectId: text('project_id').notNull().references(() => projects.id),
  tagId: integer('tag_id').notNull().references(() => tags.id),
});

export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull().references(() => projects.id),
  note: text('note'),
  createdAt: text('created_at').notNull(),
});

export const chatHistory = sqliteTable('chat_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type Bookmark = typeof bookmarks.$inferSelect;
export type ChatMessage = typeof chatHistory.$inferSelect;
