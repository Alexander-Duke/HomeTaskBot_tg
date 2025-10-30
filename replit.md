# Clean Node.js Project

## Overview
A clean, modern Node.js project with Express server and beautiful React frontend. This starter template provides a professional landing page that displays real-time server status, available routes, and system information.

## Current State
**Status**: Complete and Working ✅
- ✅ Frontend components created with beautiful UI
- ✅ Theme system (dark/light mode) implemented
- ✅ Backend API endpoints working correctly
- ✅ Integration complete and tested
- ✅ Error handling and loading states implemented
- ✅ All tests passed successfully

## Recent Changes (October 30, 2025)
- Created landing page with Hero section, server info cards, features grid, and code examples
- Implemented dark/light theme toggle with SSR-safe localStorage
- Set up TypeScript schemas for server data (ServerInfo, Routes)
- Configured SEO meta tags and Open Graph
- Used Inter and JetBrains Mono fonts as specified in design guidelines
- Implemented backend API endpoints with Zod validation
- Fixed ESM compatibility issues (removed require() calls)
- Added comprehensive error states for better UX
- Successfully tested all features with end-to-end tests

## Project Architecture

### Frontend (Client)
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query
- **Styling**: Tailwind CSS + Shadcn UI components
- **Theme**: Dark/Light mode with localStorage persistence

### Backend (Server)
- **Framework**: Express.js
- **Runtime**: Node.js 20
- **Storage**: In-memory (MemStorage)
- **Data Model**: Zod schemas for validation

### Key Features
1. **Landing Page**: Professional server status display
2. **Real-time Updates**: Server info refreshes every 5 seconds
3. **Route Documentation**: Auto-generated API route list
4. **System Metrics**: Node version, uptime, memory usage
5. **Code Examples**: Getting started snippets
6. **Responsive Design**: Mobile-first approach

## File Structure
```
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── theme-provider.tsx
│   │   │   ├── theme-toggle.tsx
│   │   │   └── ui/ (Shadcn components)
│   │   ├── pages/
│   │   │   ├── home.tsx
│   │   │   └── not-found.tsx
│   │   ├── App.tsx
│   │   └── index.css
│   └── index.html
├── server/
│   ├── routes.ts (API endpoints)
│   ├── storage.ts (In-memory storage)
│   └── index.ts
├── shared/
│   └── schema.ts (Shared TypeScript types)
└── design_guidelines.md
```

## API Endpoints (Planned)
- `GET /api/server/info` - Get server status and metrics
- `GET /api/server/routes` - Get list of available routes

## User Preferences
- Design approach: Clean, technical aesthetic inspired by GitHub/Vercel/Linear
- Typography: Inter (sans) + JetBrains Mono (code)
- Color scheme: Professional blue primary color with subtle grays
- Layout: Generous spacing, card-based design with borders
- No heavy shadows, emphasis on clarity and professionalism

## Development Notes
- Following fullstack_js development guidelines
- Using in-memory storage (no database required for this starter)
- All components use proper data-testid attributes for testing
- Design guidelines strictly followed for visual consistency
- Minimal animations - only where it enhances UX
