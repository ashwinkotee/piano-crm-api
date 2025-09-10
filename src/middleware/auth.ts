import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";

export function requireAuth(roles?: ("admin" | "portal")[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
    if (!token) {
      res.status(401).json({ error: "No access token" });
      return;
    }

    try {
      const payload = verifyToken<{ sub: string; role: "admin" | "portal" }>(token);
      if (roles && !roles.includes(payload.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      (req as any).user = payload;
      next();
    } catch (err) {
      // Avoid leaking details to clients; log minimal server-side
      res.status(401).json({ error: "Invalid token" });
      return;
    }

  };
}
