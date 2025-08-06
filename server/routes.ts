import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupSession, registerUser, loginUser, requireAuth, getCurrentUser } from "./auth";
import { insertUserSchema, loginUserSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup session middleware
  setupSession(app);

  // Auth routes
  app.post('/api/auth/register', async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await registerUser(userData);
      
      // Log the user in automatically after registration
      req.session.userId = user.id;
      req.session.user = user;
      
      res.json({ 
        message: 'User registered successfully', 
        user: { id: user.id, username: user.username, email: user.email } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      res.status(400).json({ message: error instanceof Error ? error.message : 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const credentials = loginUserSchema.parse(req.body);
      const user = await loginUser(credentials);
      
      if (!user) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
      
      req.session.userId = user.id;
      req.session.user = user;
      
      res.json({ 
        message: 'Login successful', 
        user: { id: user.id, username: user.username, email: user.email } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      res.status(500).json({ message: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: 'Logout failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logout successful' });
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    res.json({ id: user.id, username: user.username, email: user.email });
  });

  // Protected routes
  app.get('/api/protected/comments', requireAuth, (req, res) => {
    res.json({ message: 'Access granted to comment de-identification tool' });
  });

  const httpServer = createServer(app);

  return httpServer;
}
