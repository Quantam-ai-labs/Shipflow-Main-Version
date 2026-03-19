import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startAutoSync } from "./services/autoSync";
import { startCourierSyncScheduler } from "./services/courierSyncScheduler";
import { startMarketingSyncScheduler } from "./services/metaAds";
import { startConfirmationTimer } from "./services/confirmationTimer";
import { startRobocallService } from "./services/robocallService";
import { db } from "./db";
import { shopifyStores, users, courierAccounts } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
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

async function seedSuperAdmin() {
  try {
    const admins = await db.select().from(users).where(eq(users.role, "SUPER_ADMIN"));
    if (admins.length > 0) {
      console.log(`[Seed] SUPER_ADMIN already exists: ${admins.map(a => a.email).join(", ")}`);
      return;
    }

    const adminEmail = "usamax.mail+admin@gmail.com";
    const [existing] = await db.select().from(users).where(eq(users.email, adminEmail));

    if (existing) {
      await db.update(users).set({ role: "SUPER_ADMIN" }).where(eq(users.id, existing.id));
      console.log(`[Seed] Promoted existing user ${adminEmail} to SUPER_ADMIN`);
    } else {
      const passwordHash = await bcrypt.hash("1SOL.AI@Admin2026!", 12);
      await db.insert(users).values({
        email: adminEmail,
        passwordHash,
        firstName: "Super",
        lastName: "Admin",
        role: "SUPER_ADMIN",
        isActive: true,
      });
      console.log(`[Seed] Created SUPER_ADMIN user: ${adminEmail}`);
    }
  } catch (err: any) {
    console.error("[Seed] Failed to seed SUPER_ADMIN:", err.message);
  }
}

async function warmCourierCityCache() {
  try {
    const { loadLeopardsCities, loadPostExCities } = await import("./services/couriers/booking");
    const accounts = await db.select().from(courierAccounts);
    let leopardsWarmed = 0;
    let postexWarmed = 0;
    for (const account of accounts) {
      const name = account.courierName?.toLowerCase();
      if (name === "leopards" && account.apiKey && account.apiSecret) {
        await loadLeopardsCities(account.apiKey, account.apiSecret);
        leopardsWarmed++;
      } else if (name === "postex" && account.apiKey) {
        await loadPostExCities(account.apiKey);
        postexWarmed++;
      }
    }
    if (leopardsWarmed + postexWarmed > 0) {
      console.log(`[CityCache] Pre-warmed: ${leopardsWarmed} Leopards, ${postexWarmed} PostEx accounts`);
    }
  } catch (err: any) {
    console.error("[CityCache] Warm-up failed:", err.message);
  }
}

function scheduleStartupRecovery() {
  setTimeout(async () => {
    try {
      const connectedStores = await db
        .select()
        .from(shopifyStores)
        .where(eq(shopifyStores.isConnected, true));

      if (connectedStores.length === 0) return;

      const { ShopifyService } = await import('./services/shopify');
      const shopifyService = new ShopifyService();

      for (const store of connectedStores) {
        if (!store.accessToken || !store.shopDomain || !store.merchantId) continue;
        try {
          console.log(`[StartupRecovery] Full sync for merchant ${store.merchantId} (${store.shopDomain}) to recover timezone-missed orders`);
          await shopifyService.syncOrders(store.merchantId, store.shopDomain, true);
        } catch (err: any) {
          console.error(`[StartupRecovery] Failed for merchant ${store.merchantId}:`, err.message);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (err: any) {
      console.error('[StartupRecovery] Error:', err.message);
    }
  }, 30000);
}

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

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      seedSuperAdmin();
      startAutoSync();
      setTimeout(() => startCourierSyncScheduler(), 5000);
      setTimeout(() => startMarketingSyncScheduler(), 15000);
      setTimeout(() => startConfirmationTimer(), 25000);
      setTimeout(() => startRobocallService(), 35000);
      scheduleStartupRecovery();
      setTimeout(() => warmCourierCityCache(), 10000);
    },
  );
})();
