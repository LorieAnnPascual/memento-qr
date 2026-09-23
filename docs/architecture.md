# Memento QR Code Generator — Architecture & Development Plan

**Purpose:** This document serves as the technical reference for building the Memento QR Code Generator using Claude Code. It defines the tech stack, architecture, database schema, API design, project structure, and phased development roadmap.

**Scope:** Internal-use QR code generator tool for a 6-person team. Generates general-purpose QR codes with advanced styling, template-based landing page design with HTML export and live publishing (shareable URLs with optional expiration), dynamic QR code redirects, and scan analytics.

**This is NOT a customer-facing platform.** No public sign-up, no e-commerce, no payment processing. The tool runs on a free Vercel subdomain (`memento-qr.vercel.app` or similar).

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [API Routes](#api-routes)
6. [QR Code Generation](#qr-code-generation)
7. [QR Code Payload Formats](#qr-code-payload-formats)
8. [QR Code Templates](#qr-code-templates)
9. [Landing Page Template Builder](#landing-page-template-builder)
10. [Landing Page Live Publishing](#landing-page-live-publishing)
11. [Dynamic QR Codes & Redirects](#dynamic-qr-codes--redirects)
12. [Scan Analytics](#scan-analytics)
13. [File Storage](#file-storage)
14. [Authentication](#authentication)
15. [Deployment & Infrastructure](#deployment--infrastructure)
16. [Environment Variables](#environment-variables)
17. [Phased Development Roadmap](#phased-development-roadmap)
18. [Development Conventions](#development-conventions)
19. [Key Dependencies](#key-dependencies)
20. [Reference Links](#reference-links)

---

## Tech Stack

| Category         | Technology                    | Version / Notes                            |
| ---------------- | ----------------------------- | ------------------------------------------ |
| Framework        | Next.js (App Router)          | Latest stable, TypeScript strict mode      |
| Language         | TypeScript                    | Strict mode enabled                        |
| Styling          | Tailwind CSS                  | v4+                                        |
| UI Components    | shadcn/ui                     | Radix-based, copy-paste components         |
| QR Generation    | qr-code-styling               | v1.5.0+, MIT, client-side canvas + SVG     |
| Database         | Supabase (PostgreSQL)         | Free tier: 500 MB, 2 projects              |
| ORM              | Drizzle ORM                   | Type-safe, lightweight, edge-compatible    |
| Auth             | Supabase Auth                 | Built-in, free tier: 50K MAU               |
| File Storage     | Supabase Storage              | Free tier: 1 GB                            |
| Page Builder     | Puck                          | MIT, React-native visual editor            |
| Charts           | Recharts                      | MIT, React charting for analytics          |
| Device Detection | ua-parser-js                  | MIT, user-agent parsing                    |
| Short Codes      | nanoid                        | Custom alphabet, 6-char codes              |
| Hosting          | Vercel (Hobby)                | Free tier: 100 GB bandwidth, 1M fn/mo     |
| Package Manager  | pnpm                          | Fast, disk-efficient                       |

### Why These Choices

- **Next.js** — Full-stack in one project (frontend + API routes + SSR). Largest ecosystem and AI-assisted development support. Zero-config deployment to Vercel.
- **Vercel Hobby** — Best developer experience for Next.js. Free tier is suitable since this is a personal/internal-use tool (not a commercial SaaS). No domain purchase needed — runs on `*.vercel.app`.
- **Supabase** — All-in-one: PostgreSQL database + Auth + Storage. Free tier covers all needs for 6 users. Built-in auth means no separate auth service to configure.
- **Drizzle ORM** — Lightweight (33KB vs Prisma's 800KB+), type-safe, no code generation step. Works natively at the edge.
- **qr-code-styling** — Most feature-rich MIT QR styling library. 6 dot styles, gradients, logo embedding, SVG/PNG/JPEG/WebP export. Used by major open-source QR tools (QR Forge, etc.).
- **Puck** — React-native visual editor (13.3K GitHub stars, MIT). Drag-and-drop page building with custom components. JSON output stored in database, rendered to downloadable HTML.
- **shadcn/ui** — Not a dependency — components are copied into the project. Full customization, accessible by default, professional look out of the box.
- **Recharts** — Composable React charting library built on D3. Perfect for scan analytics dashboards.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    VERCEL (Hobby Plan)                     │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              Next.js Application                      │ │
│  │                                                       │ │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────┐ │ │
│  │  │  Dashboard   │  │  QR Designer  │  │  API Routes│ │ │
│  │  │  (Analytics) │  │  (Templates)  │  │  (/api/*)  │ │ │
│  │  └──────────────┘  └───────────────┘  └────────────┘ │ │
│  │                                                       │ │
│  │  ┌───────────────┐  ┌────────────────────────────┐   │ │
│  │  │ Page Builder  │  │  Dynamic QR Redirect       │   │ │
│  │  │ (Puck Editor) │  │  /q/:shortCode             │   │ │
│  │  └───────────────┘  └────────────────────────────┘   │ │
│  │                                                       │ │
│  │  ┌────────────────────────────────────────────────┐   │ │
│  │  │  Published Landing Pages (public)              │   │ │
│  │  │  /p/:shortCode                                 │   │ │
│  │  └────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────┬──────────────────────────────────────────────── ┘
           │
     ┌─────▼──────────────────────┐
     │       Supabase              │
     │  ┌──────────┐ ┌──────────┐ │
     │  │PostgreSQL│ │  Auth    │ │
     │  │(Database)│ │(6 users) │ │
     │  └──────────┘ └──────────┘ │
     │  ┌──────────┐              │
     │  │ Storage  │              │
     │  │ (Files)  │              │
     │  └──────────┘              │
     └────────────────────────────┘
```

### Request Flow: Dynamic QR Code Scan

```
User scans QR code
        ↓
Browser opens: memento-qr.vercel.app/q/abc123
        ↓
Next.js route handler: /q/[shortCode]/route.ts
        ↓
1. Look up short code in Supabase → get target URL
2. Validate: not paused, not expired, under scan limit
3. Log scan event (IP, user-agent, geo, timestamp)
4. Increment scan counter (atomic transaction)
        ↓
HTTP 302 redirect → target URL
```

### Request Flow: QR Code Generation

```
Team member opens QR Designer
        ↓
1. Select QR type (URL, vCard, WiFi, etc.)
2. Fill in type-specific form fields
3. Choose/edit QR design template OR start from scratch
4. Customize: dot style, colors, gradients, logo, frame
5. Live preview updates in real-time (client-side)
        ↓
Export: Download as SVG (print) / PNG / JPEG / WebP
        ↓
Optionally save QR config to database for reuse/editing
```

### Request Flow: Published Landing Page

```
Team member finishes designing a page in Puck editor
        ↓
Clicks "Publish" → POST /api/pages/[id]/publish
        ↓
1. Generate 6-char short code (nanoid, same safe alphabet as QR)
2. Set is_published = true, published_at = now()
3. Optionally set expires_at (team member picks a date, or leaves blank for indefinite)
        ↓
Shareable URL: memento-qr.vercel.app/p/abc123
        ↓
Anyone visits the URL:
1. Look up short code in page_templates table
2. Validate: is_published = true, not expired
3. Server-side render Puck JSON to HTML (same renderer as export)
4. Return full HTML page (200 OK)
        ↓
If expired → "This page has expired" message (410 Gone)
If not found → 404 page
```

---

## Project Structure

```
memento-qr/
├── public/
│   └── logos/                    # Default logos/icons
│
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx          # Login page
│   │   │   └── layout.tsx            # Auth layout (no sidebar)
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx            # Dashboard layout (sidebar + header)
│   │   │   ├── page.tsx              # Dashboard home / overview
│   │   │   │
│   │   │   ├── qr/
│   │   │   │   ├── page.tsx          # QR code list (all saved QR codes)
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx      # QR code designer / creator
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # View/edit existing QR code
│   │   │   │       └── analytics/
│   │   │   │           └── page.tsx  # Scan analytics for this QR
│   │   │   │
│   │   │   ├── templates/
│   │   │   │   ├── page.tsx          # QR design templates gallery
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Edit template
│   │   │   │
│   │   │   ├── pages/
│   │   │   │   ├── page.tsx          # Landing page templates list
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx      # Puck page builder
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Edit page with Puck
│   │   │   │       └── export/
│   │   │   │           └── route.ts  # Export page as HTML
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx          # Global scan analytics dashboard
│   │   │   │
│   │   │   └── settings/
│   │   │       └── page.tsx          # Team & app settings
│   │   │
│   │   ├── q/
│   │   │   └── [shortCode]/
│   │   │       └── route.ts          # Dynamic QR redirect + scan logging
│   │   │
│   │   ├── p/
│   │   │   └── [shortCode]/
│   │   │       └── page.tsx          # Published landing page (PUBLIC, SSR)
│   │   │
│   │   ├── api/
│   │   │   ├── qr/
│   │   │   │   ├── route.ts          # CRUD: list/create QR codes
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts      # CRUD: get/update/delete QR code
│   │   │   │
│   │   │   ├── templates/
│   │   │   │   ├── route.ts          # CRUD: QR design templates
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts      # CRUD: single template
│   │   │   │
│   │   │   ├── pages/
│   │   │   │   ├── route.ts          # CRUD: landing page templates
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts      # CRUD: single page template
│   │   │   │       ├── publish/
│   │   │   │       │   └── route.ts  # Publish/unpublish page (POST/DELETE)
│   │   │   │       └── expiry/
│   │   │   │           └── route.ts  # Set/remove expiration (PUT)
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   └── route.ts          # Scan analytics aggregation
│   │   │   │
│   │   │   ├── upload/
│   │   │   │   └── route.ts          # File upload (logos, images)
│   │   │   │
│   │   │   └── auth/
│   │   │       └── [...supabase]/
│   │   │           └── route.ts      # Supabase auth callback
│   │   │
│   │   ├── layout.tsx                # Root layout
│   │   └── globals.css               # Tailwind + custom styles
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   ├── qr/
│   │   │   ├── qr-designer.tsx       # Main QR code designer component
│   │   │   ├── qr-preview.tsx        # Live QR code preview
│   │   │   ├── qr-type-forms/        # Form per QR type (URL, vCard, WiFi...)
│   │   │   │   ├── url-form.tsx
│   │   │   │   ├── vcard-form.tsx
│   │   │   │   ├── wifi-form.tsx
│   │   │   │   ├── email-form.tsx
│   │   │   │   ├── sms-form.tsx
│   │   │   │   ├── phone-form.tsx
│   │   │   │   ├── whatsapp-form.tsx
│   │   │   │   ├── event-form.tsx
│   │   │   │   ├── location-form.tsx
│   │   │   │   ├── text-form.tsx
│   │   │   │   └── social-form.tsx
│   │   │   ├── qr-style-editor.tsx   # Dot/corner/color/gradient controls
│   │   │   ├── qr-logo-upload.tsx    # Logo upload + positioning
│   │   │   ├── qr-export.tsx         # Export format selector + download
│   │   │   └── qr-template-picker.tsx # Template gallery modal
│   │   │
│   │   ├── pages/
│   │   │   ├── puck-config.tsx       # Puck component configuration
│   │   │   ├── puck-components/      # Custom Puck building blocks
│   │   │   │   ├── hero-section.tsx
│   │   │   │   ├── text-block.tsx
│   │   │   │   ├── image-gallery.tsx
│   │   │   │   ├── contact-card.tsx
│   │   │   │   ├── video-embed.tsx
│   │   │   │   ├── social-links.tsx
│   │   │   │   ├── map-embed.tsx
│   │   │   │   └── footer.tsx
│   │   │   └── page-renderer.tsx     # Server-side HTML renderer for export
│   │   │
│   │   ├── analytics/
│   │   │   ├── scan-chart.tsx        # Daily/weekly scan trend chart
│   │   │   ├── device-breakdown.tsx  # Device/browser/OS pie charts
│   │   │   ├── location-table.tsx    # Top locations table
│   │   │   └── stats-cards.tsx       # Total scans, unique visitors, etc.
│   │   │
│   │   └── layout/
│   │       ├── sidebar.tsx           # Navigation sidebar
│   │       ├── header.tsx            # Top header with user menu
│   │       └── mobile-nav.tsx        # Mobile navigation
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts             # Drizzle client initialization
│   │   │   ├── schema.ts            # All table definitions
│   │   │   └── migrations/          # Drizzle migration files
│   │   │
│   │   ├── qr/
│   │   │   ├── generator.ts         # QR code generation wrapper
│   │   │   ├── payloads.ts          # Payload format builders per QR type
│   │   │   └── short-code.ts        # nanoid short code generator
│   │   │
│   │   ├── storage/
│   │   │   └── supabase-storage.ts  # File upload/download helpers
│   │   │
│   │   ├── analytics/
│   │   │   ├── scan-logger.ts       # Scan event logging
│   │   │   ├── geo-lookup.ts        # IP geolocation via ip-api.com
│   │   │   └── device-parser.ts     # User-agent parsing via ua-parser-js
│   │   │
│   │   ├── auth/
│   │   │   ├── supabase-server.ts   # Supabase server client
│   │   │   ├── supabase-client.ts   # Supabase browser client
│   │   │   └── middleware.ts        # Auth middleware
│   │   │
│   │   ├── pages/
│   │   │   ├── html-exporter.ts     # Puck JSON → standalone HTML converter
│   │   │   └── page-publisher.ts    # Publish/unpublish logic, short code generation
│   │   │
│   │   └── utils/
│   │       ├── cn.ts                # Tailwind class merge utility
│   │       └── constants.ts         # App-wide constants
│   │
│   ├── hooks/
│   │   ├── use-qr-code.ts           # QR code generation hook
│   │   └── use-debounce.ts          # Debounce for live preview
│   │
│   └── types/
│       ├── qr.ts                    # QR code types and interfaces
│       ├── templates.ts             # Template types
│       ├── analytics.ts             # Scan analytics types
│       └── pages.ts                 # Landing page builder types
│
├── drizzle.config.ts                # Drizzle ORM configuration
├── middleware.ts                     # Next.js middleware (auth guard)
├── next.config.ts                   # Next.js configuration
├── tailwind.config.ts               # Tailwind configuration
├── tsconfig.json                    # TypeScript configuration
├── package.json
├── pnpm-lock.yaml
├── .env.local                       # Environment variables (local)
├── .env.example                     # Environment variables template
└── .gitignore
```

---

## Database Schema

Using Drizzle ORM with Supabase PostgreSQL. All tables use UUID primary keys and timestamps.

```sql
-- ============================================================
-- USERS (managed by Supabase Auth — this is a profile extension)
-- ============================================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE,         -- References Supabase auth.users.id
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member',   -- 'admin' | 'member'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_profiles_auth_id ON user_profiles(auth_id);

-- ============================================================
-- QR CODES
-- ============================================================
CREATE TABLE qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  
  -- QR content
  name TEXT NOT NULL,                    -- User-given label ("Office WiFi", "My vCard")
  qr_type TEXT NOT NULL,                 -- 'url' | 'vcard' | 'wifi' | 'email' | 'sms' | 'phone' | 'whatsapp' | 'event' | 'location' | 'text' | 'social'
  payload TEXT NOT NULL,                 -- The encoded data string
  payload_fields JSONB,                  -- Original form values (for editing)
  
  -- Dynamic QR
  is_dynamic BOOLEAN NOT NULL DEFAULT false,
  short_code TEXT UNIQUE,               -- nanoid short code for dynamic QR redirect
  target_url TEXT,                       -- Current redirect target (dynamic QR only)
  
  -- QR design
  style_config JSONB NOT NULL,          -- Full qr-code-styling options (dots, colors, corners, gradient, logo, etc.)
  template_id UUID REFERENCES qr_templates(id),  -- Optional: which template was used
  
  -- Controls
  is_paused BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,               -- Optional expiration
  scan_limit INTEGER,                    -- Optional max scans
  scan_count INTEGER NOT NULL DEFAULT 0, -- Denormalized counter
  
  -- Metadata
  tags TEXT[],                           -- Searchable tags
  notes TEXT,                            -- Internal notes
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_codes_user_id ON qr_codes(user_id);
CREATE INDEX idx_qr_codes_short_code ON qr_codes(short_code);
CREATE INDEX idx_qr_codes_qr_type ON qr_codes(qr_type);

-- ============================================================
-- QR DESIGN TEMPLATES
-- ============================================================
CREATE TABLE qr_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),   -- NULL = system-provided template
  
  name TEXT NOT NULL,                    -- "Elegant Memorial", "Business Blue"
  description TEXT,
  category TEXT NOT NULL,                -- 'memorial' | 'business' | 'event' | 'social' | 'pet' | 'general' | 'custom'
  thumbnail_url TEXT,                    -- Preview image URL
  
  style_config JSONB NOT NULL,           -- qr-code-styling options (partial — user overrides merge on top)
  
  is_public BOOLEAN NOT NULL DEFAULT true,  -- Visible to all team members
  is_system BOOLEAN NOT NULL DEFAULT false,  -- Pre-built, non-deletable
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_templates_category ON qr_templates(category);

-- ============================================================
-- LANDING PAGE TEMPLATES
-- ============================================================
CREATE TABLE page_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  
  name TEXT NOT NULL,                    -- "Memorial Page", "Pet Profile"
  description TEXT,
  category TEXT NOT NULL,                -- 'memorial' | 'business' | 'event' | 'social' | 'pet' | 'restaurant' | 'custom'
  thumbnail_url TEXT,
  
  puck_data JSONB NOT NULL,              -- Puck editor JSON output
  
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  
  -- Live publishing
  is_published BOOLEAN NOT NULL DEFAULT false,  -- Whether the page is live at /p/:shortCode
  short_code TEXT UNIQUE,                -- nanoid short code for the published URL
  published_at TIMESTAMPTZ,              -- When the page was first published
  expires_at TIMESTAMPTZ,                -- Optional expiration (NULL = lives indefinitely)
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_templates_category ON page_templates(category);
CREATE INDEX idx_page_templates_short_code ON page_templates(short_code);

-- ============================================================
-- SCAN EVENTS (for dynamic QR analytics)
-- ============================================================
CREATE TABLE scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  
  -- Request data
  ip_hash TEXT,                           -- SHA-256 hash of IP (never store raw IPs)
  user_agent TEXT,
  referrer TEXT,
  
  -- Parsed device info (from ua-parser-js)
  device_type TEXT,                      -- 'mobile' | 'tablet' | 'desktop'
  browser TEXT,                          -- 'Chrome' | 'Safari' | 'Firefox' ...
  os TEXT,                               -- 'iOS' | 'Android' | 'Windows' ...
  
  -- Geolocation (from ip-api.com)
  country TEXT,
  country_code TEXT,
  region TEXT,
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scan_events_qr_code_id ON scan_events(qr_code_id);
CREATE INDEX idx_scan_events_scanned_at ON scan_events(scanned_at);
CREATE INDEX idx_scan_events_country ON scan_events(country);

-- ============================================================
-- UPLOADED FILES (logos, images for page builder)
-- ============================================================
CREATE TABLE uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,            -- Bytes
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,            -- Supabase Storage path
  public_url TEXT NOT NULL,              -- Public URL from Supabase
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_uploaded_files_user_id ON uploaded_files(user_id);
```

---

## API Routes

| Method | Route                         | Description                                    |
| ------ | ----------------------------- | ---------------------------------------------- |
| POST   | `/api/qr`                     | Create a new QR code                           |
| GET    | `/api/qr`                     | List QR codes (with filters, search, pagination) |
| GET    | `/api/qr/[id]`                | Get single QR code details                     |
| PUT    | `/api/qr/[id]`                | Update QR code (content, style, target URL)     |
| DELETE | `/api/qr/[id]`                | Delete QR code                                 |
| POST   | `/api/templates`              | Create QR design template                      |
| GET    | `/api/templates`              | List QR design templates (by category)         |
| GET    | `/api/templates/[id]`         | Get single template                            |
| PUT    | `/api/templates/[id]`         | Update template                                |
| DELETE | `/api/templates/[id]`         | Delete template                                |
| POST   | `/api/pages`                  | Create landing page template                   |
| GET    | `/api/pages`                  | List landing page templates                    |
| GET    | `/api/pages/[id]`             | Get single page template (with Puck JSON)      |
| PUT    | `/api/pages/[id]`             | Update page template                           |
| DELETE | `/api/pages/[id]`             | Delete page template                           |
| GET    | `/api/pages/[id]/export`      | Export page as standalone HTML file             |
| POST   | `/api/pages/[id]/publish`     | Publish page live (generates short code, sets is_published) |
| DELETE | `/api/pages/[id]/publish`     | Unpublish page (sets is_published = false)     |
| PUT    | `/api/pages/[id]/expiry`      | Set or remove expiration date on published page |
| POST   | `/api/upload`                 | Upload file (logo, image) to Supabase Storage  |
| GET    | `/api/analytics`              | Global scan analytics (date range, filters)    |
| GET    | `/api/analytics/[qrId]`       | Per-QR scan analytics                          |
| GET    | `/q/[shortCode]`              | Dynamic QR redirect (public, no auth)          |
| GET    | `/p/[shortCode]`              | Published landing page (public, SSR, no auth)  |

### Auth Middleware

All `/api/*` and `/dashboard/*` routes are protected by Supabase Auth middleware. Two routes are **public** (no auth required):
- `/q/[shortCode]` — Dynamic QR redirect (anyone scanning a QR code must reach the redirect)
- `/p/[shortCode]` — Published landing pages (anyone with the link can view the page)

---

## QR Code Generation

### Client-Side QR Generation with `qr-code-styling`

```typescript
// src/lib/qr/generator.ts
import QRCodeStyling, { type Options } from 'qr-code-styling';

export interface QRDesignConfig {
  data: string;
  width?: number;
  height?: number;
  type?: 'canvas' | 'svg';
  // Dot styling
  dotStyle?: 'rounded' | 'dots' | 'classy' | 'classy-rounded' | 'square' | 'extra-rounded';
  dotColor?: string;
  dotGradient?: {
    type: 'linear' | 'radial';
    rotation?: number;
    colorStops: { offset: number; color: string }[];
  };
  // Corner square styling
  cornerSquareStyle?: 'dot' | 'square' | 'extra-rounded';
  cornerSquareColor?: string;
  // Corner dot styling
  cornerDotStyle?: 'dot' | 'square';
  cornerDotColor?: string;
  // Background
  backgroundColor?: string;
  backgroundGradient?: {
    type: 'linear' | 'radial';
    rotation?: number;
    colorStops: { offset: number; color: string }[];
  };
  // Logo
  logoUrl?: string;
  logoSize?: number;        // 0.0 to 0.5 (ratio of QR size)
  logoMargin?: number;
  // Error correction
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export function createQRCode(config: QRDesignConfig): QRCodeStyling {
  const options: Options = {
    width: config.width ?? 1024,
    height: config.height ?? 1024,
    type: config.type ?? 'svg',
    data: config.data,
    dotsOptions: {
      type: config.dotStyle ?? 'rounded',
      color: config.dotColor ?? '#000000',
      ...(config.dotGradient && { gradient: config.dotGradient }),
    },
    cornersSquareOptions: {
      type: config.cornerSquareStyle ?? 'extra-rounded',
      color: config.cornerSquareColor ?? '#000000',
    },
    cornersDotOptions: {
      type: config.cornerDotStyle ?? 'dot',
      color: config.cornerDotColor ?? '#000000',
    },
    backgroundOptions: {
      color: config.backgroundColor ?? '#FFFFFF',
      ...(config.backgroundGradient && { gradient: config.backgroundGradient }),
    },
    ...(config.logoUrl && {
      image: config.logoUrl,
      imageOptions: {
        crossOrigin: 'anonymous',
        margin: config.logoMargin ?? 5,
        imageSize: config.logoSize ?? 0.4,
        hideBackgroundDots: true,
      },
    }),
    qrOptions: {
      errorCorrectionLevel: config.errorCorrectionLevel ?? (config.logoUrl ? 'H' : 'M'),
    },
  };

  return new QRCodeStyling(options);
}

// Export functions
export async function downloadQR(
  qr: QRCodeStyling,
  format: 'png' | 'jpeg' | 'webp' | 'svg',
  fileName: string
): Promise<void> {
  await qr.download({
    name: fileName,
    extension: format,
  });
}

// For high-resolution print export
export function createPrintQR(config: QRDesignConfig): QRCodeStyling {
  return createQRCode({
    ...config,
    width: 2048,       // High-res for print
    height: 2048,
    type: 'svg',       // SVG is infinitely scalable
    errorCorrectionLevel: 'H',  // Max error correction for physical products
  });
}
```

### React Hook for Live Preview

```typescript
// src/hooks/use-qr-code.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { createQRCode, type QRDesignConfig } from '@/lib/qr/generator';
import { useDebounce } from './use-debounce';

export function useQRCode(config: QRDesignConfig) {
  const ref = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const debouncedConfig = useDebounce(config, 150);

  useEffect(() => {
    if (!ref.current) return;

    const qr = createQRCode({
      ...debouncedConfig,
      width: 300,    // Preview size
      height: 300,
    });

    ref.current.innerHTML = '';
    qr.append(ref.current);
    qrRef.current = qr;
  }, [debouncedConfig]);

  return { ref, qrInstance: qrRef };
}
```

---

## QR Code Payload Formats

Each QR type encodes data using a specific string format. The tool provides a form per type that generates the correct payload string.

```typescript
// src/lib/qr/payloads.ts

// ---- URL ----
export function buildUrlPayload(url: string): string {
  // Ensure protocol is present
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

// ---- Plain Text ----
export function buildTextPayload(text: string): string {
  return text;
}

// ---- Phone Call ----
export function buildPhonePayload(phone: string): string {
  return `tel:${phone}`;
}

// ---- SMS ----
export function buildSmsPayload(phone: string, message?: string): string {
  const base = `sms:${phone}`;
  return message ? `${base}?body=${encodeURIComponent(message)}` : base;
}

// ---- Email ----
export function buildEmailPayload(
  address: string,
  subject?: string,
  body?: string
): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  return `mailto:${address}${query ? `?${query}` : ''}`;
}

// ---- WiFi ----
export function buildWifiPayload(
  ssid: string,
  password: string,
  security: 'WPA' | 'WEP' | 'nopass' = 'WPA',
  hidden: boolean = false
): string {
  const escapedSsid = ssid.replace(/([\\;,:"'])/g, '\\$1');
  const escapedPass = password.replace(/([\\;,:"'])/g, '\\$1');
  return `WIFI:T:${security};S:${escapedSsid};P:${escapedPass};H:${hidden};;`;
}

// ---- vCard (Contact) ----
export interface VCardData {
  firstName: string;
  lastName: string;
  organization?: string;
  title?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

export function buildVCardPayload(data: VCardData): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${data.lastName};${data.firstName};;;`,
    `FN:${data.firstName} ${data.lastName}`,
  ];
  if (data.organization) lines.push(`ORG:${data.organization}`);
  if (data.title) lines.push(`TITLE:${data.title}`);
  if (data.phone) lines.push(`TEL;TYPE=WORK,VOICE:${data.phone}`);
  if (data.mobile) lines.push(`TEL;TYPE=CELL:${data.mobile}`);
  if (data.email) lines.push(`EMAIL:${data.email}`);
  if (data.website) lines.push(`URL:${data.website}`);
  if (data.address) {
    const a = data.address;
    lines.push(`ADR:;;${a.street || ''};${a.city || ''};${a.state || ''};${a.zip || ''};${a.country || ''}`);
  }
  lines.push('END:VCARD');
  return lines.join('\n');
}

// ---- WhatsApp ----
export function buildWhatsAppPayload(phone: string, message?: string): string {
  // Phone without + prefix
  const cleanPhone = phone.replace(/^\+/, '');
  const base = `https://wa.me/${cleanPhone}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

// ---- Calendar Event ----
export interface EventData {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  description?: string;
  timezone?: string;
}

export function buildEventPayload(data: EventData): string {
  const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `SUMMARY:${data.title}`,
    `DTSTART:${formatDate(data.startDate)}`,
    `DTEND:${formatDate(data.endDate)}`,
  ];
  if (data.location) lines.push(`LOCATION:${data.location}`);
  if (data.description) lines.push(`DESCRIPTION:${data.description}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\n');
}

// ---- Location (Geo) ----
export function buildLocationPayload(
  latitude: number,
  longitude: number,
  label?: string
): string {
  const base = `geo:${latitude},${longitude}`;
  return label ? `${base}?q=${encodeURIComponent(label)}` : base;
}

// ---- Social Media Links ----
export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  tiktok?: string;
  youtube?: string;
  linkedin?: string;
  website?: string;
}

// Social links are encoded as a URL pointing to a link-in-bio style page
// or as the primary social URL directly
export function buildSocialPayload(primaryUrl: string): string {
  return buildUrlPayload(primaryUrl);
}
```

---

## QR Code Templates

Templates are pre-configured `style_config` objects that define the visual appearance of a QR code. Users can pick a template, then customize further or start from scratch.

### System Templates (Pre-built)

```typescript
// Seed data — inserted during initial setup
const SYSTEM_TEMPLATES = [
  {
    name: 'Classic Black',
    category: 'general',
    description: 'Clean black and white QR code',
    style_config: {
      dotStyle: 'square',
      dotColor: '#000000',
      backgroundColor: '#FFFFFF',
      cornerSquareStyle: 'square',
      cornerDotStyle: 'square',
      errorCorrectionLevel: 'M',
    },
  },
  {
    name: 'Rounded Modern',
    category: 'general',
    description: 'Soft rounded dots with modern feel',
    style_config: {
      dotStyle: 'rounded',
      dotColor: '#1a1a2e',
      backgroundColor: '#FFFFFF',
      cornerSquareStyle: 'extra-rounded',
      cornerDotStyle: 'dot',
      errorCorrectionLevel: 'M',
    },
  },
  {
    name: 'Elegant Memorial',
    category: 'memorial',
    description: 'Muted tones with classy dot style',
    style_config: {
      dotStyle: 'classy-rounded',
      dotColor: '#2c3e50',
      backgroundColor: '#faf9f6',
      cornerSquareStyle: 'extra-rounded',
      cornerDotStyle: 'dot',
      errorCorrectionLevel: 'H',
    },
  },
  {
    name: 'Business Blue',
    category: 'business',
    description: 'Professional blue gradient',
    style_config: {
      dotStyle: 'rounded',
      dotGradient: {
        type: 'linear',
        rotation: 45,
        colorStops: [
          { offset: 0, color: '#0066cc' },
          { offset: 1, color: '#004499' },
        ],
      },
      backgroundColor: '#FFFFFF',
      cornerSquareStyle: 'extra-rounded',
      cornerDotStyle: 'dot',
      errorCorrectionLevel: 'M',
    },
  },
  {
    name: 'Pet Tag Green',
    category: 'pet',
    description: 'Friendly green for pet identification',
    style_config: {
      dotStyle: 'extra-rounded',
      dotColor: '#2d6a4f',
      backgroundColor: '#FFFFFF',
      cornerSquareStyle: 'dot',
      cornerDotStyle: 'dot',
      errorCorrectionLevel: 'H',
    },
  },
  {
    name: 'Event Gold',
    category: 'event',
    description: 'Warm gold gradient for celebrations',
    style_config: {
      dotStyle: 'dots',
      dotGradient: {
        type: 'radial',
        colorStops: [
          { offset: 0, color: '#d4a373' },
          { offset: 1, color: '#8b6914' },
        ],
      },
      backgroundColor: '#FFFFFF',
      cornerSquareStyle: 'extra-rounded',
      cornerDotStyle: 'dot',
      errorCorrectionLevel: 'M',
    },
  },
  {
    name: 'Social Vibrant',
    category: 'social',
    description: 'Bold gradient for social media links',
    style_config: {
      dotStyle: 'dots',
      dotGradient: {
        type: 'linear',
        rotation: 135,
        colorStops: [
          { offset: 0, color: '#f72585' },
          { offset: 1, color: '#7209b7' },
        ],
      },
      backgroundColor: '#FFFFFF',
      cornerSquareStyle: 'dot',
      cornerDotStyle: 'dot',
      errorCorrectionLevel: 'M',
    },
  },
  {
    name: 'Restaurant Warm',
    category: 'business',
    description: 'Warm colors for restaurant menus',
    style_config: {
      dotStyle: 'classy',
      dotColor: '#6b2737',
      backgroundColor: '#fefae0',
      cornerSquareStyle: 'extra-rounded',
      cornerDotStyle: 'dot',
      errorCorrectionLevel: 'M',
    },
  },
];
```

### Template Workflow

1. User opens QR Designer → clicks "Choose Template"
2. Template gallery shows thumbnails organized by category
3. User picks a template → its `style_config` is loaded into the editor
4. User can further customize any setting (colors, dots, logo, etc.)
5. User can save their customized version as a new template

---

## Landing Page Template Builder

### Puck Integration

Puck is embedded as a full page builder within the dashboard. Team members can design landing page layouts using drag-and-drop, then export the result as a standalone HTML file.

### Puck Component Configuration

```typescript
// src/components/pages/puck-config.tsx
import type { Config } from '@measured/puck';

// Define the building blocks available in the editor
export const puckConfig: Config = {
  components: {
    HeroSection: {
      fields: {
        title: { type: 'text', label: 'Title' },
        subtitle: { type: 'textarea', label: 'Subtitle' },
        ctaText: { type: 'text', label: 'CTA Button Text' },
        ctaUrl: { type: 'text', label: 'CTA Button URL' },
        backgroundImage: { type: 'text', label: 'Background Image URL' },
        backgroundColor: { type: 'text', label: 'Background Color' },
        textColor: { type: 'text', label: 'Text Color' },
        alignment: {
          type: 'select',
          label: 'Alignment',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ],
        },
      },
      defaultProps: {
        title: 'Welcome',
        subtitle: '',
        ctaText: '',
        ctaUrl: '',
        backgroundColor: '#1a1a2e',
        textColor: '#ffffff',
        alignment: 'center',
      },
      render: ({ title, subtitle, ctaText, ctaUrl, backgroundColor, textColor, alignment }) => (
        <section
          style={{ backgroundColor, color: textColor, textAlign: alignment, padding: '4rem 2rem' }}
        >
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '1.25rem', marginTop: '1rem' }}>{subtitle}</p>}
          {ctaText && (
            <a href={ctaUrl} style={{ display: 'inline-block', marginTop: '1.5rem', padding: '0.75rem 2rem', backgroundColor: textColor, color: backgroundColor, borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 'bold' }}>
              {ctaText}
            </a>
          )}
        </section>
      ),
    },

    TextBlock: {
      fields: {
        content: { type: 'textarea', label: 'Content' },
        backgroundColor: { type: 'text', label: 'Background Color' },
      },
      defaultProps: { content: 'Your text here...', backgroundColor: '#ffffff' },
      render: ({ content, backgroundColor }) => (
        <section style={{ backgroundColor, padding: '2rem' }}>
          <p style={{ maxWidth: '720px', margin: '0 auto', lineHeight: 1.7 }}>{content}</p>
        </section>
      ),
    },

    ImageGallery: {
      fields: {
        images: { type: 'textarea', label: 'Image URLs (one per line)' },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [
            { label: '2', value: '2' },
            { label: '3', value: '3' },
            { label: '4', value: '4' },
          ],
        },
      },
      defaultProps: { images: '', columns: '3' },
      render: ({ images, columns }) => {
        const urls = images.split('\n').filter(Boolean);
        return (
          <section style={{ padding: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1rem' }}>
              {urls.map((url, i) => (
                <img key={i} src={url} alt="" style={{ width: '100%', borderRadius: '8px' }} />
              ))}
            </div>
          </section>
        );
      },
    },

    ContactCard: {
      fields: {
        name: { type: 'text', label: 'Name' },
        phone: { type: 'text', label: 'Phone' },
        email: { type: 'text', label: 'Email' },
        address: { type: 'textarea', label: 'Address' },
      },
      defaultProps: { name: '', phone: '', email: '', address: '' },
      render: ({ name, phone, email, address }) => (
        <section style={{ padding: '2rem', backgroundColor: '#f8f9fa' }}>
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{name}</h3>
            {phone && <p>📞 {phone}</p>}
            {email && <p>✉️ {email}</p>}
            {address && <p>📍 {address}</p>}
          </div>
        </section>
      ),
    },

    VideoEmbed: {
      fields: {
        url: { type: 'text', label: 'YouTube or Vimeo URL' },
      },
      defaultProps: { url: '' },
      render: ({ url }) => {
        // Convert YouTube URL to embed format
        const embedUrl = url.replace('watch?v=', 'embed/');
        return (
          <section style={{ padding: '2rem' }}>
            <div style={{ maxWidth: '720px', margin: '0 auto', aspectRatio: '16/9' }}>
              <iframe
                src={embedUrl}
                style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
                allowFullScreen
              />
            </div>
          </section>
        );
      },
    },

    SocialLinks: {
      fields: {
        links: { type: 'textarea', label: 'Social links (label|url, one per line)' },
      },
      defaultProps: { links: '' },
      render: ({ links }) => {
        const items = links.split('\n').filter(Boolean).map(line => {
          const [label, url] = line.split('|');
          return { label: label?.trim(), url: url?.trim() };
        });
        return (
          <section style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {items.map((item, i) => (
                <a key={i} href={item.url} target="_blank" rel="noopener"
                  style={{ padding: '0.5rem 1.5rem', backgroundColor: '#1a1a2e', color: '#fff', borderRadius: '2rem', textDecoration: 'none' }}>
                  {item.label}
                </a>
              ))}
            </div>
          </section>
        );
      },
    },

    MapEmbed: {
      fields: {
        address: { type: 'text', label: 'Google Maps Embed URL or Address' },
      },
      defaultProps: { address: '' },
      render: ({ address }) => (
        <section style={{ padding: '2rem' }}>
          <iframe
            src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
            style={{ width: '100%', height: '300px', border: 'none', borderRadius: '8px' }}
          />
        </section>
      ),
    },

    Footer: {
      fields: {
        text: { type: 'text', label: 'Footer Text' },
        backgroundColor: { type: 'text', label: 'Background Color' },
      },
      defaultProps: { text: '© 2026 Memento', backgroundColor: '#1a1a2e' },
      render: ({ text, backgroundColor }) => (
        <footer style={{ backgroundColor, color: '#ffffff', padding: '2rem', textAlign: 'center' }}>
          <p>{text}</p>
        </footer>
      ),
    },
  },
};
```

### HTML Export

```typescript
// src/lib/pages/html-exporter.ts
import { Render } from '@measured/puck';
import { renderToStaticMarkup } from 'react-dom/server';
import { puckConfig } from '@/components/pages/puck-config';

export function exportToHTML(puckData: any, title: string): string {
  // Render Puck components to static HTML
  const bodyHTML = renderToStaticMarkup(
    <Render config={puckConfig} data={puckData} />
  );

  // Wrap in a complete standalone HTML document
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    img { max-width: 100%; height: auto; }
    a { color: inherit; }
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
}
```

## Landing Page Live Publishing

In addition to HTML export, landing pages can be **published live** with a shareable URL. Published pages are publicly accessible to anyone with the link — no authentication required.

**How it works:**
- Each published page gets a unique short code (same nanoid safe alphabet as dynamic QR codes)
- The page is server-side rendered from the stored Puck JSON on each visit
- Optionally, the team can set an expiration date (after which the page shows an expiry message)
- Pages live indefinitely by default (no expiration unless explicitly set)

**Key distinction from HTML export:** Export gives you a downloadable `.html` file to host anywhere. Live publish hosts the page directly on `memento-qr.vercel.app/p/[shortCode]` — no separate hosting needed.

### Publish/Unpublish API

```typescript
// src/app/api/pages/[id]/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateShortCode } from '@/lib/qr/short-code';

// Publish a page
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth check...

  const body = await request.json().catch(() => ({}));
  const expiresAt = body.expires_at ? new Date(body.expires_at) : null;

  // Validate expiration date is in the future
  if (expiresAt && expiresAt <= new Date()) {
    return Response.json(
      { error: 'Expiration date must be in the future', code: 'INVALID_EXPIRY' },
      { status: 400 }
    );
  }

  const [page] = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, params.id))
    .limit(1);

  if (!page) {
    return Response.json(
      { error: 'Page not found', code: 'PAGE_NOT_FOUND' },
      { status: 404 }
    );
  }

  // Reuse existing short code if already published before, otherwise generate new
  const shortCode = page.shortCode || generateShortCode();

  await db
    .update(pageTemplates)
    .set({
      isPublished: true,
      shortCode,
      publishedAt: page.publishedAt || new Date(),
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(pageTemplates.id, params.id));

  const publishedUrl = `${process.env.NEXT_PUBLIC_APP_URL}/p/${shortCode}`;

  return Response.json({
    published: true,
    short_code: shortCode,
    url: publishedUrl,
    expires_at: expiresAt?.toISOString() || null,
  });
}

// Unpublish a page
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth check...

  await db
    .update(pageTemplates)
    .set({
      isPublished: false,
      updatedAt: new Date(),
    })
    .where(eq(pageTemplates.id, params.id));

  // Note: short_code is preserved so re-publishing uses the same URL
  return Response.json({ published: false });
}
```

### Set/Remove Expiration API

```typescript
// src/app/api/pages/[id]/expiry/route.ts
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth check...

  const body = await request.json();

  // body.expires_at = ISO string or null (to remove expiration)
  const expiresAt = body.expires_at ? new Date(body.expires_at) : null;

  if (expiresAt && expiresAt <= new Date()) {
    return Response.json(
      { error: 'Expiration date must be in the future', code: 'INVALID_EXPIRY' },
      { status: 400 }
    );
  }

  await db
    .update(pageTemplates)
    .set({
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(pageTemplates.id, params.id));

  return Response.json({ expires_at: expiresAt?.toISOString() || null });
}
```

### Published Page Route (Public, SSR)

```typescript
// src/app/p/[shortCode]/page.tsx
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { Render } from '@measured/puck';
import { puckConfig } from '@/components/pages/puck-config';

// Dynamic metadata for SEO/social sharing
export async function generateMetadata({ params }: { params: { shortCode: string } }) {
  const [page] = await db
    .select({ name: pageTemplates.name, description: pageTemplates.description })
    .from(pageTemplates)
    .where(eq(pageTemplates.shortCode, params.shortCode))
    .limit(1);

  if (!page) return { title: 'Page Not Found' };

  return {
    title: page.name,
    description: page.description || `${page.name} — powered by Memento`,
  };
}

export default async function PublishedPage({
  params,
}: {
  params: { shortCode: string };
}) {
  const { shortCode } = params;

  const [page] = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.shortCode, shortCode))
    .limit(1);

  // Not found or not published
  if (!page || !page.isPublished) {
    notFound();
  }

  // Check expiration
  if (page.expiresAt && new Date(page.expiresAt) < new Date()) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>This page has expired</h1>
        <p style={{ color: '#666' }}>This page is no longer available.</p>
      </div>
    );
  }

  // Render the Puck page
  return <Render config={puckConfig} data={page.puckData} />;
}
```

### Page Publisher Helper

```typescript
// src/lib/pages/page-publisher.ts
import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface PublishedPageStatus {
  isPublished: boolean;
  shortCode: string | null;
  publishedUrl: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  isExpired: boolean;
}

export async function getPublishStatus(pageId: string): Promise<PublishedPageStatus | null> {
  const [page] = await db
    .select({
      isPublished: pageTemplates.isPublished,
      shortCode: pageTemplates.shortCode,
      publishedAt: pageTemplates.publishedAt,
      expiresAt: pageTemplates.expiresAt,
    })
    .from(pageTemplates)
    .where(eq(pageTemplates.id, pageId))
    .limit(1);

  if (!page) return null;

  const isExpired = page.expiresAt ? new Date(page.expiresAt) < new Date() : false;

  return {
    isPublished: page.isPublished,
    shortCode: page.shortCode,
    publishedUrl: page.shortCode
      ? `${process.env.NEXT_PUBLIC_APP_URL}/p/${page.shortCode}`
      : null,
    publishedAt: page.publishedAt,
    expiresAt: page.expiresAt,
    isExpired,
  };
}
```

---

## Dynamic QR Codes & Redirects

Dynamic QR codes encode a short redirect URL (e.g., `memento-qr.vercel.app/q/abc123`) instead of the final destination. The destination can be changed later without reprinting the QR code.

### Short Code Generation

```typescript
// src/lib/qr/short-code.ts
import { customAlphabet } from 'nanoid';

// Exclude ambiguous characters: 0, O, 1, l, I
const SAFE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export const generateShortCode = customAlphabet(SAFE_ALPHABET, 6);
// Example output: "k7m2x9"
```

### Redirect Route Handler

```typescript
// src/app/q/[shortCode]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { qrCodes, scanEvents } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { logScanEvent } from '@/lib/analytics/scan-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { shortCode: string } }
) {
  const { shortCode } = params;

  // 1. Look up the QR code
  const [qr] = await db
    .select()
    .from(qrCodes)
    .where(eq(qrCodes.shortCode, shortCode))
    .limit(1);

  if (!qr || !qr.targetUrl) {
    return new NextResponse(
      '<html><body><h1>QR Code Not Found</h1><p>This QR code does not exist or has been removed.</p></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // 2. Check if paused
  if (qr.isPaused) {
    return new NextResponse(
      '<html><body><h1>QR Code Paused</h1><p>This QR code has been temporarily deactivated.</p></body></html>',
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // 3. Check expiration
  if (qr.expiresAt && new Date(qr.expiresAt) < new Date()) {
    return new NextResponse(
      '<html><body><h1>QR Code Expired</h1><p>This QR code is no longer active.</p></body></html>',
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // 4. Check scan limit
  if (qr.scanLimit && qr.scanCount >= qr.scanLimit) {
    return new NextResponse(
      '<html><body><h1>Scan Limit Reached</h1><p>This QR code has reached its maximum number of scans.</p></body></html>',
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // 5. Log scan event (non-blocking — don't delay the redirect)
  logScanEvent(qr.id, request).catch(console.error);

  // 6. Increment scan counter (atomic)
  await db
    .update(qrCodes)
    .set({ scanCount: sql`${qrCodes.scanCount} + 1` })
    .where(eq(qrCodes.id, qr.id));

  // 7. Redirect
  return NextResponse.redirect(qr.targetUrl, 302);
}
```

---

## Scan Analytics

### Scan Event Logger

```typescript
// src/lib/analytics/scan-logger.ts
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { scanEvents } from '@/lib/db/schema';
import { parseDevice } from './device-parser';
import { lookupGeo } from './geo-lookup';

export async function logScanEvent(qrCodeId: string, request: NextRequest) {
  // Extract IP address
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  const userAgent = request.headers.get('user-agent') || '';
  const referrer = request.headers.get('referer') || '';

  // Hash IP for privacy (never store raw IPs)
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const ipHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Parse device info
  const device = parseDevice(userAgent);

  // Geo lookup (with timeout, non-blocking)
  const geo = await lookupGeo(ip);

  // Insert scan event
  await db.insert(scanEvents).values({
    qrCodeId,
    ipHash,
    userAgent,
    referrer,
    deviceType: device.type,
    browser: device.browser,
    os: device.os,
    country: geo?.country || null,
    countryCode: geo?.countryCode || null,
    region: geo?.region || null,
    city: geo?.city || null,
    latitude: geo?.lat || null,
    longitude: geo?.lon || null,
  });
}
```

### Device Parser

```typescript
// src/lib/analytics/device-parser.ts
import { UAParser } from 'ua-parser-js';

export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
}

export function parseDevice(userAgent: string): DeviceInfo {
  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  const browser = parser.getBrowser();
  const os = parser.getOS();

  return {
    type: (device.type === 'mobile' || device.type === 'tablet')
      ? device.type
      : 'desktop',
    browser: browser.name || 'Unknown',
    os: os.name || 'Unknown',
  };
}
```

### Geolocation Lookup

```typescript
// src/lib/analytics/geo-lookup.ts

interface GeoResult {
  country: string;
  countryCode: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
}

const PRIVATE_IP_REGEX = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|localhost|unknown)/;

export async function lookupGeo(ip: string): Promise<GeoResult | null> {
  // Skip private/local IPs
  if (PRIVATE_IP_REGEX.test(ip)) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2-second timeout

    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=country,countryCode,regionName,city,lat,lon,status`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const data = await response.json();

    if (data.status !== 'success') return null;

    return {
      country: data.country,
      countryCode: data.countryCode,
      region: data.regionName,
      city: data.city,
      lat: data.lat,
      lon: data.lon,
    };
  } catch {
    // Timeout or network error — return null, scan is still logged
    return null;
  }
}
```

### Analytics API Route

```typescript
// src/app/api/analytics/route.ts — simplified example
// Returns aggregated scan data for the dashboard

export async function GET(request: NextRequest) {
  // Auth check...
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from'); // ISO date
  const to = searchParams.get('to');     // ISO date
  const qrId = searchParams.get('qrId'); // Optional: filter by specific QR

  // Query scan_events with date range and optional QR filter
  // Return:
  // - totalScans: count
  // - uniqueVisitors: count(distinct ip_hash)
  // - dailyScans: [{ date, count }]
  // - deviceBreakdown: [{ type, count }]
  // - browserBreakdown: [{ browser, count }]
  // - topCountries: [{ country, count }]
  // - topCities: [{ city, country, count }]
  // - recentScans: last 50 scan events
}
```

---

## File Storage

### Supabase Storage Setup

Files (logos, images for page builder) are stored in Supabase Storage. Free tier provides 1 GB — more than sufficient for logos and template assets.

```typescript
// src/lib/storage/supabase-storage.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'uploads';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function uploadFile(
  file: File,
  folder: string = 'logos'
): Promise<{ path: string; publicUrl: string }> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 5 MB limit');
  }

  const ext = file.name.split('.').pop();
  const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  return { path: data.path, publicUrl };
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path]);

  if (error) throw error;
}
```

### Storage Organization

```
uploads/
├── logos/                  # QR code logos
│   ├── {uuid}.png
│   └── {uuid}.svg
├── templates/             # Template thumbnails
│   └── {uuid}.png
└── pages/                 # Page builder images
    └── {uuid}.jpg
```

---

## Authentication

### Supabase Auth Setup

Supabase Auth provides built-in email/password authentication. For a 6-person internal team, invite users directly via the Supabase dashboard or seed them via SQL.

```typescript
// src/lib/auth/supabase-server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export async function getAuthUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

```typescript
// src/lib/auth/supabase-client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Auth Middleware

```typescript
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  // Skip auth for public routes
  if (
    request.nextUrl.pathname.startsWith('/q/') ||
    request.nextUrl.pathname.startsWith('/p/')
  ) {
    return NextResponse.next(); // QR redirect and published pages are public
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Redirect to login if not authenticated
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect to dashboard if authenticated and on login page
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|q/|p/).*)',
  ],
};
```

---

## Deployment & Infrastructure

### Vercel (Hobby Plan) — Free Tier Limits

| Resource                 | Limit                          |
| ------------------------ | ------------------------------ |
| Bandwidth                | 100 GB / month                 |
| Function Invocations     | 1,000,000 / month              |
| Edge Requests            | 1,000,000 / month              |
| Build Minutes            | Included (concurrent: 1)       |
| Deployments              | 100 / day                      |
| Projects                 | 200                            |
| Serverless Function Duration | 300 seconds (5 min)         |
| Image Optimization       | 5,000 transformations / month  |
| Web Analytics            | 50,000 events / month          |

### Supabase — Free Tier Limits

| Resource                 | Limit                          |
| ------------------------ | ------------------------------ |
| Database                 | 500 MB                         |
| Auth Users (MAU)         | 50,000                         |
| File Storage             | 1 GB                           |
| Bandwidth                | 5 GB / month                   |
| Edge Function Invocations | 500,000 / month               |
| Projects                 | 2 per organization             |
| Inactivity Pause         | After 1 week of no API calls   |
| Log Retention            | 7 days                         |

### Keeping Supabase Awake

With 6 active team members using the tool regularly, the database receives natural API calls that prevent inactivity pausing. As a safety net, add a simple health-check API route that Vercel Cron can ping:

```typescript
// src/app/api/health/route.ts
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  await db.execute(sql`SELECT 1`);
  return Response.json({ ok: true, timestamp: new Date().toISOString() });
}
```

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/health",
      "schedule": "0 */12 * * *"
    }
  ]
}
```

### Deployment Steps

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment variables in Vercel dashboard
#    (or .env.local for local development)

# 3. Run database migrations
pnpm drizzle-kit push

# 4. Seed system templates
pnpm db:seed

# 5. Deploy to Vercel
vercel deploy --prod

# Or connect GitHub repo for automatic deployments
```

---

## Environment Variables

```bash
# .env.example

# ============================================
# Supabase
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Supabase Database (for Drizzle direct connection)
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

# ============================================
# App
# ============================================
NEXT_PUBLIC_APP_URL=https://memento-qr.vercel.app
NEXT_PUBLIC_APP_NAME=Memento QR

# ============================================
# ip-api.com (no key needed — free tier)
# ============================================
# Uses http://ip-api.com/json/{ip} directly
# Rate limit: 45 requests/minute (free)
```

---

## Phased Development Roadmap

### Phase 1: Core QR Generator (Weeks 1–4)

**Goal:** Functional QR code designer with all types, templates, and export.

- **Week 1:** Project setup & infrastructure
  - Initialize Next.js + TypeScript + Tailwind + shadcn/ui
  - Set up Supabase project (database, auth, storage)
  - Configure Drizzle ORM and run initial migrations
  - Create database schema (user_profiles, qr_codes, qr_templates)
  - Implement Supabase Auth (login/logout, middleware)
  - Build dashboard layout (sidebar, header, responsive)

- **Week 2:** QR code type forms & payload generation
  - Build payload generators for all 11 QR types
  - Create form components for each type (URL, vCard, WiFi, email, SMS, phone, WhatsApp, event, location, text, social)
  - Input validation per type
  - QR type selector with icons/descriptions

- **Week 3:** QR code designer & styling
  - Integrate `qr-code-styling` with live preview
  - Build style editor (dot style, corner style, colors, gradients)
  - Logo upload and positioning
  - Template picker (gallery view)
  - Seed system templates (8 pre-built templates)
  - Save custom templates workflow

- **Week 4:** Export, save & manage
  - Multi-format export (SVG, PNG, JPEG, WebP) with quality/size options
  - High-resolution print export (2048px+)
  - Save QR codes to database (CRUD)
  - QR code list view with search, filter, pagination
  - Edit existing QR codes
  - File upload to Supabase Storage

### Phase 2: Dynamic QR & Scan Analytics (Weeks 5–7)

**Goal:** Dynamic QR codes with redirect management and analytics dashboard.

- **Week 5:** Dynamic QR infrastructure
  - Short code generation with nanoid
  - Redirect route handler (`/q/[shortCode]`)
  - Validation gates (paused, expired, scan limit)
  - Toggle between static and dynamic mode in QR designer
  - Edit target URL for existing dynamic QR codes

- **Week 6:** Scan tracking & analytics
  - Scan event logging (IP hash, user-agent, referrer)
  - Device/browser/OS parsing with ua-parser-js
  - IP geolocation with ip-api.com (with timeout/fallback)
  - Analytics API routes (aggregate queries)
  - Per-QR analytics page

- **Week 7:** Analytics dashboard
  - Global analytics dashboard (all QR codes)
  - Recharts integration: daily trend line chart, device pie chart, browser bar chart
  - Top locations table
  - Date range picker and filters
  - Stats cards (total scans, unique visitors, top QR code)
  - CSV export of scan data

### Phase 3: Landing Page Builder (Weeks 8–11)

**Goal:** Puck-based page builder with templates, HTML export, and live publishing.

- **Week 8:** Puck integration
  - Install and configure Puck editor
  - Build custom Puck components (HeroSection, TextBlock, ImageGallery, ContactCard, VideoEmbed, SocialLinks, MapEmbed, Footer)
  - Create page builder route with Puck editor embedded
  - Save/load page designs (Puck JSON ↔ database)

- **Week 9:** Page templates & management
  - Create system page templates (Memorial, Pet Profile, Business Card, Event, Restaurant Menu)
  - Template gallery with category filtering
  - Duplicate and customize templates
  - Page design preview

- **Week 10:** HTML export
  - Server-side HTML rendering from Puck JSON
  - Standalone HTML export with inlined CSS
  - Download as HTML file
  - Polish: responsive preview (mobile/tablet/desktop toggle)
  - CSS theme options (fonts, colors) per page template

- **Week 11:** Live publishing
  - Publish/unpublish API routes (`POST/DELETE /api/pages/[id]/publish`)
  - Short code generation for published page URLs
  - Public page route (`/p/[shortCode]`) with SSR rendering
  - Optional expiration date picker in the page editor UI
  - Set/remove expiration API (`PUT /api/pages/[id]/expiry`)
  - Expiration validation and "page expired" display
  - Copy-to-clipboard for shareable URL
  - Publishing status indicator in page list and editor

### Phase 4: Polish & Advanced Features (Weeks 12+)

**Goal:** Quality of life improvements and nice-to-haves.

- Batch QR generation (CSV upload → bulk create)
- QR code folders/organization
- Team activity log
- Dark mode for the dashboard
- QR code comparison (A/B style testing)
- Scan notifications (optional — if email is added later)
- Performance optimization and caching
- Backup/export all data

---

## Development Conventions

### Code Style

- **TypeScript strict mode** — no `any` types, explicit return types on exported functions
- **ESLint** — Next.js default rules + `@typescript-eslint/strict`
- **Prettier** — single quotes, trailing commas, 100 char line width
- **File naming** — kebab-case for files, PascalCase for components
- **Imports** — use `@/` path alias for `src/`

### Component Patterns

- **Server Components** by default (no `'use client'` unless needed)
- **Client Components** only for interactivity (forms, QR preview, Puck editor)
- **Composition** over prop drilling — use React Context sparingly
- **shadcn/ui** as the base — customize via Tailwind, don't override internals

### Error Handling

```typescript
// API routes: consistent error responses
return Response.json(
  { error: 'Descriptive message', code: 'ERROR_CODE' },
  { status: 400 }
);

// Client: toast notifications for user-facing errors
import { toast } from 'sonner'; // Part of shadcn/ui
toast.error('Failed to save QR code');
```

### Database Conventions

- **UUIDs** for all primary keys (no sequential IDs)
- **Timestamps** on every table (`created_at`, `updated_at`)
- **Soft delete** preferred over hard delete for QR codes (add `deleted_at` column if needed)
- **JSONB** for flexible config storage (QR styles, Puck data)

### Git Workflow

```
main          — production-ready code
├── dev       — integration branch
    ├── feat/ — feature branches (feat/qr-designer, feat/analytics)
    ├── fix/  — bug fixes
    └── chore/ — maintenance tasks
```

- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- PR-based merges (even for solo dev — creates clear history)

---

## Key Dependencies

```json
{
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "@supabase/supabase-js": "latest",
    "@supabase/ssr": "latest",
    "drizzle-orm": "latest",
    "qr-code-styling": "^1.5.0",
    "@measured/puck": "latest",
    "nanoid": "latest",
    "recharts": "latest",
    "ua-parser-js": "latest",
    "sonner": "latest",
    "tailwind-merge": "latest",
    "clsx": "latest",
    "class-variance-authority": "latest",
    "lucide-react": "latest",
    "@radix-ui/react-dialog": "latest",
    "@radix-ui/react-dropdown-menu": "latest",
    "@radix-ui/react-select": "latest",
    "@radix-ui/react-tabs": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "typescript": "latest",
    "drizzle-kit": "latest",
    "@types/ua-parser-js": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "eslint": "latest",
    "prettier": "latest",
    "tailwindcss": "latest",
    "@tailwindcss/typography": "latest"
  }
}
```

---

## Reference Links

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth with Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [qr-code-styling GitHub](https://github.com/nicedaycode/qr-code-styling)
- [qr-code-styling npm](https://www.npmjs.com/package/qr-code-styling)
- [Puck Editor Documentation](https://puckeditor.com/docs)
- [Puck GitHub](https://github.com/puckeditor/puck)
- [Recharts Documentation](https://recharts.org/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [ua-parser-js GitHub](https://github.com/faisalman/ua-parser-js)
- [ip-api.com Documentation](https://ip-api.com/docs)
- [nanoid Documentation](https://github.com/ai/nanoid)
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
