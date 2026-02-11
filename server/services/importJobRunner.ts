import { db } from '../db';
import { shopifyImportJobs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { ShopifyService } from './shopify';
import { decryptToken } from './encryption';
import type { ShopifyImportJob } from '@shared/schema';

const activeJobs = new Map<string, { cancelled: boolean }>();

export async function getImportJob(jobId: string): Promise<ShopifyImportJob | undefined> {
  const [job] = await db.select().from(shopifyImportJobs).where(eq(shopifyImportJobs.id, jobId));
  return job;
}

export async function getActiveImportJob(merchantId: string): Promise<ShopifyImportJob | undefined> {
  const jobs = await db.select().from(shopifyImportJobs)
    .where(and(
      eq(shopifyImportJobs.merchantId, merchantId),
    ));
  const active = jobs.find(j => j.status === 'RUNNING' || j.status === 'QUEUED');
  return active || undefined;
}

export async function getLatestImportJob(merchantId: string): Promise<ShopifyImportJob | undefined> {
  const jobs = await db.select().from(shopifyImportJobs)
    .where(eq(shopifyImportJobs.merchantId, merchantId))
    .limit(20);
  if (jobs.length === 0) return undefined;
  jobs.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  return jobs[0];
}

export async function cancelImportJob(jobId: string): Promise<boolean> {
  const ctrl = activeJobs.get(jobId);
  if (ctrl) {
    ctrl.cancelled = true;
  }
  await db.update(shopifyImportJobs).set({
    status: 'CANCELLED',
    finishedAt: new Date(),
  }).where(eq(shopifyImportJobs.id, jobId));
  return true;
}

interface StartImportOptions {
  merchantId: string;
  shopDomain: string;
  accessToken: string;
  startDate?: Date;
  batchSize?: number;
}

export async function startImportJob(options: StartImportOptions): Promise<ShopifyImportJob> {
  const { merchantId, shopDomain, accessToken, batchSize = 200 } = options;

  const currentYear = new Date().getFullYear();
  const startDate = options.startDate || new Date(`${currentYear}-01-01T00:00:00.000Z`);

  const [job] = await db.insert(shopifyImportJobs).values({
    merchantId,
    shopDomain,
    status: 'QUEUED',
    startDate,
    batchSize,
    processedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    failedCount: 0,
    totalFetched: 0,
    currentPage: 0,
  }).returning();

  runImportInBackground(job.id, shopDomain, accessToken, startDate, batchSize);

  return job;
}

export async function resumeImportJob(jobId: string, accessToken: string): Promise<ShopifyImportJob | null> {
  const job = await getImportJob(jobId);
  if (!job) return null;
  if (job.status !== 'FAILED') return null;

  await db.update(shopifyImportJobs).set({
    status: 'QUEUED',
    lastError: null,
    lastErrorStage: null,
  }).where(eq(shopifyImportJobs.id, jobId));

  runImportInBackground(jobId, job.shopDomain, accessToken, job.startDate, job.batchSize || 200);

  const [updated] = await db.select().from(shopifyImportJobs).where(eq(shopifyImportJobs.id, jobId));
  return updated;
}

function runImportInBackground(jobId: string, shopDomain: string, encryptedToken: string, startDate: Date, batchSize: number) {
  const ctrl = { cancelled: false };
  activeJobs.set(jobId, ctrl);

  setImmediate(async () => {
    try {
      await executeImport(jobId, shopDomain, encryptedToken, startDate, batchSize, ctrl);
    } catch (err: any) {
      console.error(`[ImportJob ${jobId}] Unhandled error:`, err.message);
      await db.update(shopifyImportJobs).set({
        status: 'FAILED',
        lastError: err.message?.substring(0, 2000) || 'Unknown error',
        lastErrorStage: 'UNKNOWN',
        finishedAt: new Date(),
      }).where(eq(shopifyImportJobs.id, jobId));
    } finally {
      activeJobs.delete(jobId);
    }
  });
}

async function executeImport(
  jobId: string,
  shopDomain: string,
  encryptedToken: string,
  startDate: Date,
  batchSize: number,
  ctrl: { cancelled: boolean },
) {
  const plainToken = decryptToken(encryptedToken);
  const shopifyService = new ShopifyService();

  await db.update(shopifyImportJobs).set({
    status: 'RUNNING',
    startedAt: new Date(),
  }).where(eq(shopifyImportJobs.id, jobId));

  console.log(`[ImportJob ${jobId}] Starting import from ${shopDomain}, startDate=${startDate.toISOString()}, batchSize=${batchSize}`);

  const job = await getImportJob(jobId);
  if (!job) return;

  let nextUrl: string | null = null;

  if (job.nextCursor) {
    nextUrl = job.nextCursor;
    console.log(`[ImportJob ${jobId}] Resuming from cursor: ${nextUrl}`);
  } else {
    const queryParams = new URLSearchParams({
      limit: String(batchSize),
      status: 'any',
      order: 'created_at asc',
      created_at_min: startDate.toISOString(),
    });
    nextUrl = `https://${shopDomain}/admin/api/2024-01/orders.json?${queryParams.toString()}`;
  }

  let currentPage = job.currentPage || 0;
  let processedCount = job.processedCount || 0;
  let createdCount = job.createdCount || 0;
  let updatedCount = job.updatedCount || 0;
  let failedCount = job.failedCount || 0;
  let totalFetched = job.totalFetched || 0;
  let consecutiveRetries = 0;
  const maxRetries = 5;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': plainToken,
  };

  const { storage } = await import('../storage');

  while (nextUrl) {
    if (ctrl.cancelled) {
      console.log(`[ImportJob ${jobId}] Cancelled by user`);
      await db.update(shopifyImportJobs).set({
        status: 'CANCELLED',
        finishedAt: new Date(),
        currentPage,
        processedCount,
        createdCount,
        updatedCount,
        failedCount,
        totalFetched,
      }).where(eq(shopifyImportJobs.id, jobId));
      return;
    }

    currentPage++;

    try {
      console.log(`[ImportJob ${jobId}] Fetching page ${currentPage}... (${totalFetched} orders fetched so far)`);

      const response = await fetch(nextUrl, { headers });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000 * Math.pow(2, consecutiveRetries);
        console.log(`[ImportJob ${jobId}] Rate limited (429), waiting ${delay}ms...`);
        consecutiveRetries++;
        if (consecutiveRetries > maxRetries) {
          throw new Error(`Rate limited too many times (${maxRetries} consecutive retries)`);
        }
        await sleep(delay);
        currentPage--;
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        const errorText = await response.text();
        await db.update(shopifyImportJobs).set({
          status: 'FAILED',
          lastError: `Shopify returned ${response.status}: ${errorText.substring(0, 500)}. Your access token may be invalid or missing required scopes.`,
          lastErrorStage: 'FETCH',
          finishedAt: new Date(),
          currentPage,
          processedCount,
          createdCount,
          updatedCount,
          failedCount,
          totalFetched,
        }).where(eq(shopifyImportJobs.id, jobId));
        return;
      }

      if (response.status >= 500) {
        consecutiveRetries++;
        if (consecutiveRetries > maxRetries) {
          const errorText = await response.text();
          throw new Error(`Shopify server error ${response.status}: ${errorText.substring(0, 500)}`);
        }
        const delay = 1000 * Math.pow(2, consecutiveRetries);
        console.log(`[ImportJob ${jobId}] Shopify 5xx error, retrying in ${delay}ms...`);
        await sleep(delay);
        currentPage--;
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error ${response.status}: ${errorText.substring(0, 500)}`);
      }

      consecutiveRetries = 0;

      const data = await response.json();
      const orders = data.orders || [];
      totalFetched += orders.length;

      const linkHeader = response.headers.get('Link');
      const parsedNextUrl = parseNextPageUrl(linkHeader);

      const allShopifyIds = orders.map((o: any) => String(o.id));
      let existingOrdersMap: Map<string, string>;
      let courierConfirmedIds: Set<string>;

      try {
        existingOrdersMap = await storage.getExistingOrdersByShopifyIds(job.merchantId, allShopifyIds);
        courierConfirmedIds = await storage.getOrdersWithCourierStatus(job.merchantId, allShopifyIds);
      } catch (dbErr: any) {
        await db.update(shopifyImportJobs).set({
          status: 'FAILED',
          lastError: `Database lookup failed: ${dbErr.message?.substring(0, 500)}`,
          lastErrorStage: 'UPSERT',
          finishedAt: new Date(),
          nextCursor: nextUrl,
          currentPage,
          processedCount,
          createdCount,
          updatedCount,
          failedCount,
          totalFetched,
        }).where(eq(shopifyImportJobs.id, jobId));
        return;
      }

      const now = new Date();
      for (const shopifyOrder of orders) {
        try {
          const shopifyOrderId = String(shopifyOrder.id);
          const transformedOrder = shopifyService.transformOrderForStorage(shopifyOrder);
          const existingOrderId = existingOrdersMap.get(shopifyOrderId);
          const hasCourierStatus = courierConfirmedIds.has(shopifyOrderId);
          const initialWorkflowStatus = shopifyService.determineWorkflowStatus(shopifyOrder);

          if (existingOrderId) {
            const updateData: any = {
              customerName: transformedOrder.customerName,
              customerEmail: transformedOrder.customerEmail,
              customerPhone: transformedOrder.customerPhone,
              shippingAddress: transformedOrder.shippingAddress,
              city: transformedOrder.city,
              province: transformedOrder.province,
              postalCode: transformedOrder.postalCode,
              country: transformedOrder.country,
              totalAmount: transformedOrder.totalAmount,
              subtotalAmount: transformedOrder.subtotalAmount,
              shippingAmount: transformedOrder.shippingAmount,
              discountAmount: transformedOrder.discountAmount,
              currency: transformedOrder.currency,
              paymentMethod: transformedOrder.paymentMethod,
              paymentStatus: transformedOrder.paymentStatus,
              fulfillmentStatus: transformedOrder.fulfillmentStatus,
              orderStatus: transformedOrder.orderStatus,
              courierName: transformedOrder.courierName,
              courierTracking: transformedOrder.courierTracking,
              lineItems: transformedOrder.lineItems,
              totalQuantity: transformedOrder.totalQuantity,
              tags: transformedOrder.tags,
              notes: transformedOrder.notes,
              landingSite: transformedOrder.landingSite,
              referringSite: transformedOrder.referringSite,
              browserIp: transformedOrder.browserIp,
              rawShopifyData: transformedOrder.rawShopifyData,
              lastApiSyncAt: now,
              shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
            };

            if (!hasCourierStatus) {
              updateData.shipmentStatus = transformedOrder.shipmentStatus;
            }

            await storage.updateOrder(job.merchantId, existingOrderId, updateData);

            try {
              const { transitionOrder, applyRoboTags } = await import('./workflowTransition');
              if (initialWorkflowStatus === 'CANCELLED') {
                await transitionOrder({
                  merchantId: job.merchantId,
                  orderId: existingOrderId,
                  toStatus: 'CANCELLED',
                  action: 'shopify_import_cancel',
                  actorType: 'system',
                  reason: 'Cancelled in Shopify',
                  extraData: {
                    cancelledAt: shopifyOrder.cancelled_at ? new Date(shopifyOrder.cancelled_at) : now,
                    cancelReason: 'Cancelled in Shopify',
                  },
                });
              } else if (initialWorkflowStatus === 'FULFILLED') {
                await transitionOrder({
                  merchantId: job.merchantId,
                  orderId: existingOrderId,
                  toStatus: 'FULFILLED',
                  action: 'shopify_import_fulfill',
                  actorType: 'system',
                  reason: 'Fulfilled in Shopify',
                });
              } else {
                await applyRoboTags(job.merchantId, existingOrderId, transformedOrder.tags);
              }
            } catch (e) {}

            updatedCount++;
          } else {
            const createData: any = {
              ...transformedOrder,
              merchantId: job.merchantId,
              workflowStatus: initialWorkflowStatus,
              lastApiSyncAt: now,
              shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
              codRemaining: transformedOrder.totalAmount,
              prepaidAmount: "0",
              codPaymentStatus: "UNPAID",
            };
            if (initialWorkflowStatus === 'CANCELLED') {
              createData.cancelledAt = shopifyOrder.cancelled_at ? new Date(shopifyOrder.cancelled_at) : now;
              createData.cancelReason = 'Cancelled in Shopify';
            }
            const created = await storage.createOrder(createData);
            if (created?.id && initialWorkflowStatus === 'NEW') {
              try {
                const { applyRoboTags } = await import('./workflowTransition');
                await applyRoboTags(job.merchantId, created.id, transformedOrder.tags);
              } catch (e) {}
            }
            createdCount++;
          }

          processedCount++;
        } catch (orderErr: any) {
          failedCount++;
          console.error(`[ImportJob ${jobId}] Failed to process order ${shopifyOrder.id}:`, orderErr.message);
          await db.update(shopifyImportJobs).set({
            lastError: `Order ${shopifyOrder.id || shopifyOrder.name}: ${orderErr.message?.substring(0, 500)}`,
            lastErrorStage: 'UPSERT',
          }).where(eq(shopifyImportJobs.id, jobId));
        }
      }

      await db.update(shopifyImportJobs).set({
        nextCursor: parsedNextUrl,
        currentPage,
        processedCount,
        createdCount,
        updatedCount,
        failedCount,
        totalFetched,
      }).where(eq(shopifyImportJobs.id, jobId));

      nextUrl = parsedNextUrl;

      if (nextUrl) {
        const callLimit = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
        let delay = 300;
        if (callLimit) {
          const [current, max] = callLimit.split('/').map(Number);
          const usage = current / max;
          if (usage > 0.8) delay = 1000;
          else if (usage > 0.5) delay = 500;
        }
        await sleep(delay);
      }

    } catch (err: any) {
      console.error(`[ImportJob ${jobId}] Error on page ${currentPage}:`, err.message);
      await db.update(shopifyImportJobs).set({
        status: 'FAILED',
        lastError: err.message?.substring(0, 2000) || 'Unknown error',
        lastErrorStage: 'FETCH',
        finishedAt: new Date(),
        nextCursor: nextUrl,
        currentPage,
        processedCount,
        createdCount,
        updatedCount,
        failedCount,
        totalFetched,
      }).where(eq(shopifyImportJobs.id, jobId));
      return;
    }
  }

  console.log(`[ImportJob ${jobId}] Import complete: ${createdCount} created, ${updatedCount} updated, ${failedCount} failed, ${totalFetched} total fetched`);

  await db.update(shopifyImportJobs).set({
    status: 'COMPLETED',
    finishedAt: new Date(),
    nextCursor: null,
    currentPage,
    processedCount,
    createdCount,
    updatedCount,
    failedCount,
    totalFetched,
  }).where(eq(shopifyImportJobs.id, jobId));

  try {
    const { storage } = await import('../storage');
    const store = await storage.getShopifyStore(job.merchantId);
    if (store) {
      await storage.updateShopifyStore(store.id, { lastSyncAt: new Date() });
    }
  } catch (e) {}
}

function parseNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const links = linkHeader.split(',');
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function validateShopifyConnection(shopDomain: string, accessToken: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const plainToken = decryptToken(accessToken);
    const response = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': plainToken,
      },
    });

    if (response.status === 401) {
      return { valid: false, error: 'Access token is invalid or has been revoked (401 Unauthorized)' };
    }
    if (response.status === 403) {
      return { valid: false, error: 'Access token lacks required scopes (403 Forbidden). Please reconnect your Shopify store.' };
    }
    if (!response.ok) {
      const text = await response.text();
      return { valid: false, error: `Shopify API error ${response.status}: ${text.substring(0, 200)}` };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: `Cannot reach Shopify: ${err.message}` };
  }
}
