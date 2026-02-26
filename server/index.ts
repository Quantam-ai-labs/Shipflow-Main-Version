import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initSyncManager, shutdownSyncManager } from "./services/syncManager";

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[FATAL] Unhandled rejection:', reason?.message || reason, reason?.stack);
});

const origExit = process.exit.bind(process);
(process as any).exit = (code?: number) => {
  const fs = require('fs');
  const msg = `[FATAL] process.exit(${code}) at ${new Date().toISOString()} from:\n${new Error().stack}\n`;
  try { fs.appendFileSync('/tmp/crash.log', msg); } catch(e) {}
  console.error(msg);
  origExit(code);
};

process.on('beforeExit', (code) => {
  const fs = require('fs');
  try { fs.appendFileSync('/tmp/crash.log', `[beforeExit] code=${code} at ${new Date().toISOString()}\n`); } catch(e) {}
});

process.on('exit', (code) => {
  const fs = require('fs');
  try { fs.appendFileSync('/tmp/crash.log', `[exit] code=${code} at ${new Date().toISOString()}\n`); } catch(e) {}
});

const memLog = () => {
  const used = process.memoryUsage();
  console.log(`[Memory] RSS: ${Math.round(used.rss / 1024 / 1024)}MB, Heap: ${Math.round(used.heapUsed / 1024 / 1024)}/${Math.round(used.heapTotal / 1024 / 1024)}MB`);
};
setInterval(memLog, 15000);

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully');
  shutdownSyncManager();
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully');
  shutdownSyncManager();
  httpServer.close(() => process.exit(0));
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      initSyncManager();
    },
  );
})();
