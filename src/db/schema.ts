import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id', { length: 256 }).primaryKey(),
  email: varchar('email', { length: 256 }).unique().notNull(),
  name: text('name').notNull(),
  password: text('password').notNull(),
  themePreference: varchar('theme_preference', { length: 50 }).default('dark').notNull(),
  createdAt: text('created_at').notNull(),
  loginStreak: integer('login_streak').default(1).notNull(),
  lastLoginDate: text('last_login_date'),
  username: varchar('username', { length: 256 }).unique(),
  country: text('country'),
  gender: varchar('gender', { length: 50 }),
  lastUsernameChangedAt: text('last_username_changed_at'),
  profileCompleted: integer('profile_completed').default(0).notNull(),
});

export const vocabWords = pgTable('vocab_words', {
  id: varchar('id', { length: 256 }).primaryKey(),
  word: varchar('word', { length: 256 }).unique().notNull(),
  partOfSpeech: varchar('part_of_speech', { length: 100 }).notNull(),
  definition: text('definition').notNull(),
  synonyms: text('synonyms').notNull(), // Comma-separated or JSON
  exampleSentence: text('example_sentence').notNull(),
  groupNumber: integer('group_number').notNull(),
  language: varchar('language', { length: 100 }).default('english').notNull(),
});

export const userVocabProgress = pgTable('user_vocab_progress', {
  id: varchar('id', { length: 256 }).primaryKey(),
  userId: varchar('user_id', { length: 256 }).references(() => users.id).notNull(),
  wordId: varchar('word_id', { length: 256 }).references(() => vocabWords.id).notNull(),
  status: varchar('status', { length: 100 }).notNull(), // 'learning' | 'mastered'
  streak: integer('streak').default(0).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const practiceQuestions = pgTable('practice_questions', {
  id: varchar('id', { length: 256 }).primaryKey(),
  questionText: text('question_text').notNull(),
  options: text('options').notNull(), // JSON array of choices
  correctAnswer: text('correct_answer').notNull(),
  section: varchar('section', { length: 100 }).notNull(), // 'quant' | 'verbal'
  category: varchar('category', { length: 256 }).notNull(), // e.g., 'Arithmetic', 'Algebra'
  difficulty: varchar('difficulty', { length: 100 }).notNull(), // 'easy' | 'medium' | 'hard'
  explanation: text('explanation').notNull(),
});

export const studyPlans = pgTable('study_plans', {
  id: varchar('id', { length: 256 }).primaryKey(),
  title: varchar('title', { length: 256 }).notNull(),
  description: text('description').notNull(),
});

export const studyDays = pgTable('study_days', {
  id: varchar('id', { length: 256 }).primaryKey(),
  planId: varchar('plan_id', { length: 256 }).references(() => studyPlans.id).notNull(),
  weekNumber: integer('week_number').notNull(),
  dayNumber: integer('day_number').notNull(),
});

export const studyTasks = pgTable('study_tasks', {
  id: varchar('id', { length: 256 }).primaryKey(),
  dayId: varchar('day_id', { length: 256 }).references(() => studyDays.id).notNull(),
  title: varchar('title', { length: 256 }).notNull(),
  taskType: varchar('task_type', { length: 100 }).notNull(), // 'video' | 'quiz' | 'read'
  contentUrl: text('content_url').notNull(),
  duration: integer('duration').default(0).notNull(), // in minutes
});

export const userTaskProgress = pgTable('user_task_progress', {
  id: varchar('id', { length: 256 }).primaryKey(),
  userId: varchar('user_id', { length: 256 }).references(() => users.id).notNull(),
  taskId: varchar('task_id', { length: 256 }).references(() => studyTasks.id).notNull(),
  completed: integer('completed').default(0).notNull(), // 0 = false, 1 = true
  completedAt: text('completed_at'),
});

export const quizAttempts = pgTable('quiz_attempts', {
  id: varchar('id', { length: 256 }).primaryKey(),
  userId: varchar('user_id', { length: 256 }).references(() => users.id).notNull(),
  score: integer('score').notNull(),
  totalQuestions: integer('total_questions').notNull(),
  section: varchar('section', { length: 100 }).notNull(), // 'quant' | 'verbal'
  attemptedAt: text('attempted_at').notNull(),
});
