import bcrypt from 'bcrypt';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import type { Express, Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { insertUserSchema, loginUserSchema, type User } from '@shared/schema';
import { z } from 'zod';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    user?: User;
  }
}

const saltRounds = 12;

export function setupSession(app: Express) {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL!,
    createTableIfMissing: true,
  });

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    }
  }));
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerUser(userData: z.infer<typeof insertUserSchema>): Promise<User> {
  // Check if user already exists
  const existingUserByUsername = await storage.getUserByUsername(userData.username);
  if (existingUserByUsername) {
    throw new Error('Username already exists');
  }

  const existingUserByEmail = await storage.getUserByEmail(userData.email);
  if (existingUserByEmail) {
    throw new Error('Email already exists');
  }

  // Hash password and create user
  const hashedPassword = await hashPassword(userData.password);
  const user = await storage.createUser({
    ...userData,
    password: hashedPassword,
  });

  return user;
}

export async function loginUser(credentials: z.infer<typeof loginUserSchema>): Promise<User | null> {
  const user = await storage.getUserByUsername(credentials.username);
  if (!user) {
    return null;
  }

  const isValidPassword = await verifyPassword(credentials.password, user.password);
  if (!isValidPassword) {
    return null;
  }

  return user;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
}

export function getCurrentUser(req: Request): User | null {
  return req.session.user || null;
}