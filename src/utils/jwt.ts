import jwt, { Secret, SignOptions } from "jsonwebtoken";

export function signAccess(payload: object) {
  const secret = process.env.JWT_SECRET as Secret;
  const opts: SignOptions = { expiresIn: process.env.JWT_ACCESS_TTL || "15m" };
  return jwt.sign(payload, secret, opts);
}
export function signRefresh(payload: object) {
  const secret = process.env.JWT_SECRET as Secret;
  const opts: SignOptions = { expiresIn: process.env.JWT_REFRESH_TTL || "30d" };
  return jwt.sign(payload, secret, opts);
}
export function verifyToken<T = any>(token: string) {
  const secret = process.env.JWT_SECRET as Secret;
  return jwt.verify(token, secret) as T;
}
