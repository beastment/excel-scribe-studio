# Eastment - AI-Powered Business Data Analysis Platform

## Overview

Eastment is a modern full-stack web application designed to help businesses analyze and process data using AI-powered tools. The platform features a comment screening tool that allows users to upload Excel/CSV files containing text comments and provides an intuitive interface for editing, filtering, and managing comment data. Built with a React frontend, Express backend, and PostgreSQL database, the application emphasizes user experience with a polished UI and responsive design.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development and building
- **UI Library**: Shadcn/ui components built on Radix UI primitives for accessible, customizable components
- **Styling**: Tailwind CSS with custom design system featuring HSL color variables and gradient utilities
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management and caching
- **File Processing**: XLSX library for Excel file parsing and manipulation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ESM modules
- **Development**: TSX for TypeScript execution in development
- **Build**: ESBuild for production bundling with external package handling
- **Middleware**: Express JSON parsing, URL encoding, and custom request logging

### Database Layer
- **Database**: PostgreSQL configured through Drizzle ORM
- **ORM**: Drizzle with type-safe schema definitions and migrations
- **Provider**: Neon Database serverless PostgreSQL
- **Schema**: Complete user management (users, sessions tables) with authentication
- **Validation**: Zod integration for runtime type checking and validation
- **Security**: Encrypted password storage, session management with PostgreSQL

### Development Environment
- **Bundler**: Vite with React plugin and hot module replacement
- **Replit Integration**: Custom plugins for cartographer and runtime error handling
- **Path Aliases**: Organized import structure with @ prefixes for clean code organization
- **TypeScript**: Strict mode enabled with comprehensive type checking

### Authentication & Session Management
- **Session Storage**: PostgreSQL-based session storage using connect-pg-simple
- **Password Handling**: Secure password storage using bcrypt with 12 salt rounds
- **User Management**: Full user CRUD operations with PostgreSQL storage
- **Authentication Flow**: Complete registration/login system with protected routes
- **Session Security**: HTTP-only cookies with 7-day expiration, secure in production

### File Upload & Processing
- **Upload Method**: Drag-and-drop interface with react-dropzone
- **Supported Formats**: Excel (.xlsx, .xls) and CSV files
- **Processing**: Client-side file parsing with XLSX library
- **Data Structure**: Comment objects with original text, edited text, author, and metadata

### UI/UX Design System
- **Design Language**: Modern, professional aesthetic with purple-based primary colors
- **Components**: Comprehensive component library including buttons, forms, dialogs, and data displays
- **Responsive Design**: Mobile-first approach with Tailwind responsive utilities
- **Animations**: Smooth transitions and hover effects for enhanced user experience
- **Toast Notifications**: Dual toast system using both Radix and Sonner for user feedback

## External Dependencies

### Core Runtime
- **@neondatabase/serverless**: PostgreSQL serverless database connection
- **drizzle-orm**: Type-safe database ORM with PostgreSQL dialect
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### UI Components & Styling
- **@radix-ui/***: Comprehensive accessible UI primitive components
- **tailwindcss**: Utility-first CSS framework with custom configuration
- **class-variance-authority**: Component variant management
- **clsx & tailwind-merge**: Conditional CSS class utilities

### File Processing
- **xlsx**: Excel file reading and writing capabilities
- **react-dropzone**: File upload with drag-and-drop interface

### Development Tools
- **vite**: Fast build tool and development server
- **typescript**: Static type checking and enhanced developer experience
- **tsx**: TypeScript execution for Node.js development
- **esbuild**: Fast JavaScript bundler for production builds

### State Management & API
- **@tanstack/react-query**: Server state management and caching
- **react-hook-form**: Form handling with validation
- **@hookform/resolvers**: Form validation resolvers

### Replit Platform Integration
- **@replit/vite-plugin-runtime-error-modal**: Development error handling
- **@replit/vite-plugin-cartographer**: Replit-specific development features