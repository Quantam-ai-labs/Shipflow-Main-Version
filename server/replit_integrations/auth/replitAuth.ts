import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";

export function getSession() {
  const sessionTtlMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds (for cookie maxAge)
  const sessionTtlSec = 24 * 60 * 60; // 24 hours in seconds (for pg store ttl)
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtlSec,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtlMs,
      sameSite: "lax",
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const sess = req.session as any;
  if (!sess?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};
