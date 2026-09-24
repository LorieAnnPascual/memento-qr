import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ============================================================
// USERS (managed by Supabase Auth — this is a profile extension)
// ============================================================
export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authId: uuid('auth_id').notNull().unique(),
    email: text('email').notNull(),
    fullName: text('full_name'),
    avatarUrl: text('avatar_url'),
    role: text('role').notNull().default('member'), // 'admin' | 'member'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_user_profiles_auth_id').on(table.authId)],
);

// ============================================================
// QR DESIGN TEMPLATES
// ============================================================
export const qrTemplates = pgTable(
  'qr_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => userProfiles.id), // NULL = system-provided
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // 'memorial' | 'business' | 'event' | 'social' | 'pet' | 'general' | 'custom'
    thumbnailUrl: text('thumbnail_url'),
    styleConfig: jsonb('style_config').notNull(),
    isPublic: boolean('is_public').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_qr_templates_category').on(table.category)],
);

// ============================================================
// FOLDERS (organize QR codes)
// ============================================================
export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_folders_user_id').on(table.userId)],
);

// ============================================================
// QR CODES
// ============================================================
export const qrCodes = pgTable(
  'qr_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id),

    // QR content
    name: text('name').notNull(),
    qrType: text('qr_type').notNull(), // see QRType union in src/types/qr.ts
    payload: text('payload').notNull(),
    payloadFields: jsonb('payload_fields'),

    // Dynamic QR
    isDynamic: boolean('is_dynamic').notNull().default(false),
    shortCode: text('short_code').unique(),
    targetUrl: text('target_url'),

    // QR design
    styleConfig: jsonb('style_config').notNull(),
    templateId: uuid('template_id').references(() => qrTemplates.id),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),

    // Controls
    isPaused: boolean('is_paused').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    scanLimit: integer('scan_limit'),
    scanCount: integer('scan_count').notNull().default(0),

    // Metadata
    tags: text('tags').array(),
    notes: text('notes'),
    // Team workflow: who last changed it, who it is handed to, and what is next.
    updatedBy: uuid('updated_by').references(() => userProfiles.id, { onDelete: 'set null' }),
    assignedTo: uuid('assigned_to').references(() => userProfiles.id, { onDelete: 'set null' }),
    nextAction: text('next_action'),
    checklist: jsonb('checklist'), // ChecklistItem[] (see src/lib/workflow/checklist.ts)
    purpose: text('purpose'), // what this code is for (e.g. "Table cards for the June event")

    // Result of the last link check (daily cron or on demand): 'ok' | 'warning' | 'broken'.
    healthStatus: text('health_status'),
    healthMessage: text('health_message'),
    healthCheckedAt: timestamp('health_checked_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_qr_codes_user_id').on(table.userId),
    index('idx_qr_codes_short_code').on(table.shortCode),
    index('idx_qr_codes_qr_type').on(table.qrType),
    index('idx_qr_codes_folder_id').on(table.folderId),
    index('idx_qr_codes_assigned_to').on(table.assignedTo),
    // The QR list: one user's codes, newest first.
    index('idx_qr_codes_user_created').on(table.userId, table.createdAt),
  ],
);

// ============================================================
// DESTINATION HISTORY (every change to a dynamic QR's destination)
// ============================================================
export const qrDestinationHistory = pgTable(
  'qr_destination_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    qrCodeId: uuid('qr_code_id')
      .notNull()
      .references(() => qrCodes.id, { onDelete: 'cascade' }),
    destination: text('destination').notNull(), // the destination that became current
    previousDestination: text('previous_destination'), // null for the first entry
    changedBy: uuid('changed_by').references(() => userProfiles.id, { onDelete: 'set null' }),
    restoredFromId: uuid('restored_from_id'), // set when this entry was a restore
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_qr_dest_history_qr_created').on(table.qrCodeId, table.createdAt)],
);

// ============================================================
// LANDING PAGE TEMPLATES
// ============================================================
export const pageTemplates = pgTable(
  'page_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => userProfiles.id),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // 'memorial' | 'business' | 'event' | 'social' | 'pet' | 'restaurant' | 'custom'
    thumbnailUrl: text('thumbnail_url'),
    puckData: jsonb('puck_data').notNull(),
    isPublic: boolean('is_public').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),

    // Live publishing
    isPublished: boolean('is_published').notNull().default(false),
    shortCode: text('short_code').unique(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    // Team workflow (same fields as QR codes).
    notes: text('notes'),
    updatedBy: uuid('updated_by').references(() => userProfiles.id, { onDelete: 'set null' }),
    assignedTo: uuid('assigned_to').references(() => userProfiles.id, { onDelete: 'set null' }),
    nextAction: text('next_action'),
    checklist: jsonb('checklist'),
    purpose: text('purpose'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_page_templates_category').on(table.category),
    index('idx_page_templates_short_code').on(table.shortCode),
    index('idx_page_templates_assigned_to').on(table.assignedTo),
  ],
);

// ============================================================
// SCAN EVENTS (for dynamic QR analytics)
// ============================================================
export const scanEvents = pgTable(
  'scan_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    qrCodeId: uuid('qr_code_id')
      .notNull()
      .references(() => qrCodes.id, { onDelete: 'cascade' }),

    // Request data
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    referrer: text('referrer'),

    // Parsed device info (from ua-parser-js)
    deviceType: text('device_type'), // 'mobile' | 'tablet' | 'desktop'
    browser: text('browser'),
    os: text('os'),

    // Geolocation (from ip-api.com)
    country: text('country'),
    countryCode: text('country_code'),
    region: text('region'),
    city: text('city'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),

    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_scan_events_qr_code_id').on(table.qrCodeId),
    index('idx_scan_events_scanned_at').on(table.scannedAt),
    index('idx_scan_events_country').on(table.country),
    // Per-code analytics over a date range.
    index('idx_scan_events_qr_scanned').on(table.qrCodeId, table.scannedAt),
  ],
);

// ============================================================
// UPLOADED FILES (logos, images for page builder)
// ============================================================
export const uploadedFiles = pgTable(
  'uploaded_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type').notNull(),
    storagePath: text('storage_path').notNull(),
    publicUrl: text('public_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_uploaded_files_user_id').on(table.userId)],
);

// ============================================================
// ACTIVITY LOG (what the team has been doing)
// ============================================================
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => userProfiles.id),
    action: text('action').notNull(), // e.g. 'qr.created', 'page.published'
    entityType: text('entity_type').notNull(), // 'qr' | 'page' | 'folder' | 'template' | 'export'
    entityId: uuid('entity_id'),
    entityName: text('entity_name'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_activity_log_created_at').on(table.createdAt),
    index('idx_activity_log_user_id').on(table.userId),
  ],
);

export type QRDestinationHistoryEntry = typeof qrDestinationHistory.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type QRTemplate = typeof qrTemplates.$inferSelect;
export type NewQRTemplate = typeof qrTemplates.$inferInsert;
export type QRCode = typeof qrCodes.$inferSelect;
export type NewQRCode = typeof qrCodes.$inferInsert;
export type PageTemplate = typeof pageTemplates.$inferSelect;
export type NewPageTemplate = typeof pageTemplates.$inferInsert;
export type ScanEvent = typeof scanEvents.$inferSelect;
export type NewScanEvent = typeof scanEvents.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type NewActivityLogEntry = typeof activityLog.$inferInsert;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type NewUploadedFile = typeof uploadedFiles.$inferInsert;
