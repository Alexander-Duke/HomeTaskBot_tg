import type { Express } from "express";
import { createServer, type Server } from "http";
import { serverInfoSchema, serverRoutesSchema } from "@shared/schema";
import os from "os";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));

const serverStartTime = new Date().toISOString();
const serverStartUptime = process.uptime();

export async function registerRoutes(app: Express): Promise<Server> {
  // GET /api/server/info - Get server information
  app.get("/api/server/info", (req, res) => {
    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;

      // Get Express version from dependencies
      const expressVersion = packageJson.dependencies?.express?.replace(/[\^~]/, '') || "4.x";
      
      const serverInfo = {
        status: "running" as const,
        nodeVersion: process.version.replace('v', ''),
        expressVersion: expressVersion,
        port: parseInt(process.env.PORT || "5000"),
        environment: (process.env.NODE_ENV || "development") as "development" | "production",
        startTime: serverStartTime,
        uptime: process.uptime() - serverStartUptime,
        memoryUsage: {
          used: usedMemory,
          total: totalMemory,
        },
      };

      const validated = serverInfoSchema.parse(serverInfo);
      res.json(validated);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve server information" });
    }
  });

  // GET /api/server/routes - Get available routes
  app.get("/api/server/routes", (req, res) => {
    try {
      const routes = [
        {
          method: "GET" as const,
          path: "/api/server/info",
          description: "Get server status and system information",
        },
        {
          method: "GET" as const,
          path: "/api/server/routes",
          description: "Get list of available API routes",
        },
      ];

      const validated = serverRoutesSchema.parse({ routes });
      res.json(validated);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve routes" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
