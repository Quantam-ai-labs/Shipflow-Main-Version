import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startAutoSync } from "./services/autoSync";
import { startCourierSyncScheduler } from "./services/courierSyncScheduler";
import { startMarketingSyncScheduler } from "./services/metaAds";
import { startConfirmationTimer } from "./services/confirmationTimer";
import { startRobocallService } from "./services/robocallService";
import { recoverPendingEvents } from "./services/waWebhookProcessor";
import { db } from "./db";
import { shopifyStores, users, courierAccounts, orders } from "../shared/schema";
import { eq, and, inArray } from "drizzle-orm";
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

// ============================================
// ONE-TIME DATA REPAIR: Lala Import HOLD → PENDING/READY_TO_SHIP
// Runs on every boot but is a no-op once all 70 orders are moved.
// ============================================
const LALA_REPAIR_MERCHANT = "63d76766-32d7-47ab-8b46-d3c479bcb58a";
const LALA_REPAIR_TO_PENDING = [
  "5a5e0dc5-7f71-44f8-9ef7-09b08a2eb861", "a0e9183b-d3ac-4a55-ad0a-667e674b8538",
  "a8ea5c4a-6f02-4fa1-ac32-9f8cc2dc5a63", "062dcb87-54ee-4c02-ac10-1f01b2fe540d",
  "f708effd-89e5-4b49-8cbe-d40f6bdf86e1", "0992e88a-d3a8-4bd6-a8f8-32db050c85bf",
  "99b7569d-f91a-40bd-b808-d95b22d4c3fe", "af4b8447-1b72-44dd-86f1-803fbb2b76b9",
  "b6f50788-759c-4c25-a045-a9106eeecd9e", "7fe4c176-5bf6-40af-8b3f-7fb5328e0fac",
  "b66d988e-56ef-4163-9382-0768783e0336", "d1fee01c-fb8e-4307-bd5a-921a45014738",
  "b7e0cfad-eefc-44c7-9dc2-f31e91ec6d0c", "3678d2a5-a1d0-494b-863e-05519d7b6424",
  "58be5fdb-5e1e-4d05-a461-ffdc654586b4", "1f3a5f06-7f9b-4ec5-805c-5fbaf9b31893",
  "dd1c5dd3-20be-4915-9445-a0c89f1d963b", "e4449692-fe64-4194-9398-fe0f8ed7e346",
  "8cee76c0-79bc-4357-b8dd-9d3c40449cc1", "02c37406-7191-44dd-b236-adb565ff8084",
  "2bdbe181-1b59-41aa-98af-8c22126be482", "337de456-d03d-4247-acc5-ca7c4507b70e",
  "c5ca38f0-ada2-4508-aaa9-e015de5bb8c5", "ee8f5467-5009-45b3-bf94-d748a4ae80f5",
  "2dd977b2-149f-4f95-b565-8d68ada400c0", "84ca51bd-df23-4bff-bd94-0c2ea0350d49",
  "de47bb77-b858-4650-830a-e01ea8f8d822", "b8707572-5057-47cf-a0f5-2cc915936df0",
  "340f0bbe-df87-4e27-9027-be60d4fdc35f", "49152b0f-d967-49da-96b9-f90b52e49f91",
  "e68bd611-27ed-423c-a0dc-1a3879ea52e2", "e9dedb9d-fde3-4b67-8ec4-681051916e57",
  "cfa7f654-6ef4-4754-bbe6-729e97a41c5c", "b715d4d9-2ac4-496c-b24d-fbf1737f383e",
  "c24f238d-420d-4363-b2c7-cea63fddd901", "ceae0b32-c3ac-41a4-8e7d-0346e3e61bf3",
  "eb4615f1-a8b4-49bc-9717-362b11a39921", "d1b97017-70f8-4c20-bc71-3a4153a85582",
  "3ff87a77-cb2d-4deb-92df-aee77b64af5f", "19e59ad6-d56d-44bc-b0fc-08d17a971e03",
  "fe86bf9c-e82a-42d6-8dbf-e2a26ae8a225", "e80208ae-d446-4915-a872-7b175ddc6afe",
  "11ac9eb2-9097-4095-9383-7d05f3c69fb6", "48be6be3-abc5-44a0-86c2-60f55de6774c",
  "493a384c-7a11-40c3-8a62-5a64e2e5b7ff", "47d00a7e-342f-47de-af6b-4cf2b748fa23",
  "c93c25a8-1872-4ac7-a2ae-e8f86278a99f", "fb000e42-3ba8-41f3-ba0c-37a179cb91a3",
  "caf33caa-f4d8-43be-b219-2ef25a6abe26", "ef0163ac-19c5-4791-8f37-4d2e7958728f",
  "f05da3a5-c4fb-44b3-b7c6-5edbc5ac8d93", "bd8f1b28-3dc8-4c58-ba36-c09cd070b000",
  "0d6a0006-b9c4-41ae-8ac8-031115ff04ee", "c3d1fb00-4a34-4ba6-8b18-4790f3283ab4",
  "9b5b2adb-1d15-42d8-ae18-60ac67cd2953", "884de028-ff30-4a98-aa11-4a10afb9776d",
  "66b41a64-a916-4346-a3b7-850f85b42a8e", "605e0f85-d2c8-4a4f-8d0d-64336b53dfdf",
  "c73d2a0f-4abf-489d-81be-7a39e6885ffa", "0071cfcf-0989-4ade-9dba-20ede37169a1",
  "ceaaa29e-8cf8-47e7-a048-e2561107e690", "16060a37-e5b3-453e-8597-2fc2e70994a2",
  "8072d2cc-20e3-408f-b338-643e4d13a756", "ebb616ba-ce43-4b61-8aa7-239e572d3d4a",
  "6a7b738e-d4b0-4ec8-bceb-f840101c3293", "da216a18-b94f-4113-982c-5c65281e006e",
  "38391afb-f5a9-4a4c-a027-d8fc8fd2db9f", "1273db14-7ea8-417e-970e-c626bb5e9d29",
  "0e8eadd8-f016-44b5-ae7c-6f15efd98099",
];
const LALA_REPAIR_TO_READY = "fd5d4db7-d9ad-4005-ba85-06925d163d56";

async function runLalaHoldRepair() {
  try {
    const allIds = [...LALA_REPAIR_TO_PENDING, LALA_REPAIR_TO_READY];

    // Fast check: how many are still in HOLD?
    const stillHold = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.merchantId, LALA_REPAIR_MERCHANT),
          eq(orders.workflowStatus, "HOLD"),
          eq(orders.conflictDetected, false),
          inArray(orders.id, allIds),
        ),
      );

    if (stillHold.length === 0) {
      console.log("[LalaRepair] Already complete — 0 orders remaining, skipping");
      return;
    }

    console.log(`[LalaRepair] Found ${stillHold.length} misclassified HOLD orders — repairing...`);

    const { transitionOrder } = await import("./services/workflowTransition");
    let moved = 0;
    let failed = 0;

    for (const id of LALA_REPAIR_TO_PENDING) {
      try {
        const result = await transitionOrder({
          merchantId: LALA_REPAIR_MERCHANT,
          orderId: id,
          toStatus: "PENDING",
          action: "data_repair",
          actorType: "system",
          actorName: "Startup Data Repair",
          reason: "Misclassified HOLD (no conflict) — auto-repaired on server startup",
        });
        if (result.success) moved++; else failed++;
      } catch (err: any) {
        console.error(`[LalaRepair] Error on ${id}:`, err.message);
        failed++;
      }
    }

    try {
      const result = await transitionOrder({
        merchantId: LALA_REPAIR_MERCHANT,
        orderId: LALA_REPAIR_TO_READY,
        toStatus: "READY_TO_SHIP",
        action: "data_repair",
        actorType: "system",
        actorName: "Startup Data Repair",
        reason: "Confirmed order stuck in HOLD — auto-repaired on server startup",
      });
      if (result.success) moved++; else failed++;
    } catch (err: any) {
      console.error(`[LalaRepair] Error on ${LALA_REPAIR_TO_READY}:`, err.message);
      failed++;
    }

    console.log(`[LalaRepair] Done — ${moved} moved, ${failed} errors`);
  } catch (err: any) {
    console.error("[LalaRepair] Startup repair failed:", err.message);
  }
}

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
      runLalaHoldRepair();
      startAutoSync();
      setTimeout(() => startCourierSyncScheduler(), 5000);
      setTimeout(() => startMarketingSyncScheduler(), 15000);
      setTimeout(() => startConfirmationTimer(), 25000);
      setTimeout(() => startRobocallService(), 35000);
      scheduleStartupRecovery();
      setTimeout(() => warmCourierCityCache(), 10000);
      setTimeout(() => recoverPendingEvents().catch((err: any) => console.error("[WA Recovery] Startup recovery failed:", err.message)), 45000);
    },
  );
})();
