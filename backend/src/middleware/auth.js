import crypto from "node:crypto";
import { config } from "../config.js";

export function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", config.jwtSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = user;
  next();
}

export function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient role" });
    next();
  };
}

export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", config.jwtSecret).update(body).digest("base64url");
  if (signature !== expected) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp < Date.now()) return null;
  return payload;
}
