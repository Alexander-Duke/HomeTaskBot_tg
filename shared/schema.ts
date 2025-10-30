import { z } from "zod";

export const serverInfoSchema = z.object({
  status: z.enum(["running", "stopped"]),
  nodeVersion: z.string(),
  expressVersion: z.string(),
  port: z.number(),
  environment: z.enum(["development", "production"]),
  startTime: z.string(),
  uptime: z.number(),
  memoryUsage: z.object({
    used: z.number(),
    total: z.number(),
  }),
});

export const routeSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  path: z.string(),
  description: z.string(),
});

export const serverRoutesSchema = z.object({
  routes: z.array(routeSchema),
});

export type ServerInfo = z.infer<typeof serverInfoSchema>;
export type Route = z.infer<typeof routeSchema>;
export type ServerRoutes = z.infer<typeof serverRoutesSchema>;
