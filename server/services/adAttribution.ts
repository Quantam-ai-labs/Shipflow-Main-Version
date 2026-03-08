import { db } from '../db';
import { orders, adCampaigns, adCreatives } from '@shared/schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';

export interface AttributionResult {
  matched: number;
  alreadyAttributed: number;
  total: number;
}

export async function attributeOrdersToCampaigns(merchantId: string): Promise<AttributionResult> {
  const unattributed = await db
    .select({
      id: orders.id,
      utmCampaign: orders.utmCampaign,
      utmContent: orders.utmContent,
    })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        isNotNull(orders.utmCampaign),
        isNull(orders.attributedCampaignId),
      )
    );

  const alreadyAttributed = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.merchantId, merchantId), isNotNull(orders.attributedCampaignId)));

  const campaigns = await db
    .select({ id: adCampaigns.id, campaignId: adCampaigns.campaignId, name: adCampaigns.name })
    .from(adCampaigns)
    .where(eq(adCampaigns.merchantId, merchantId));

  const ads = await db
    .select({ id: adCreatives.id, adId: adCreatives.adId, campaignId: adCreatives.campaignId })
    .from(adCreatives)
    .where(eq(adCreatives.merchantId, merchantId));

  const campaignByIdMap = new Map<string, typeof campaigns[0]>();
  const campaignByNameMap = new Map<string, typeof campaigns[0]>();
  for (const c of campaigns) {
    if (c.campaignId) campaignByIdMap.set(c.campaignId.toLowerCase(), c);
    if (c.name) campaignByNameMap.set(c.name.toLowerCase(), c);
  }

  const adByIdMap = new Map<string, typeof ads[0]>();
  for (const a of ads) {
    if (a.adId) adByIdMap.set(a.adId.toLowerCase(), a);
  }

  let matched = 0;

  for (const order of unattributed) {
    if (!order.utmCampaign) continue;

    const utmCampaignLower = order.utmCampaign.toLowerCase();
    const campaign =
      campaignByIdMap.get(utmCampaignLower) ||
      campaignByNameMap.get(utmCampaignLower);

    if (!campaign) continue;

    const utmContentLower = order.utmContent?.toLowerCase() ?? '';
    const ad = utmContentLower ? adByIdMap.get(utmContentLower) : undefined;

    await db
      .update(orders)
      .set({
        attributedCampaignId: campaign.campaignId,
        attributedAdId: ad?.adId ?? null,
      })
      .where(eq(orders.id, order.id));

    matched++;
  }

  return {
    matched,
    alreadyAttributed: alreadyAttributed.length,
    total: unattributed.length + alreadyAttributed.length,
  };
}

export async function getAttributionSummary(merchantId: string, dateFrom?: string, dateTo?: string) {
  const conditions: any[] = [
    eq(orders.merchantId, merchantId),
    isNotNull(orders.attributedCampaignId),
  ];

  if (dateFrom) {
    conditions.push(sql`${orders.orderDate} >= ${dateFrom}::date`);
  }
  if (dateTo) {
    conditions.push(sql`${orders.orderDate} <= (${dateTo}::date + interval '1 day')`);
  }

  const attributedOrders = await db
    .select({
      id: orders.id,
      attributedCampaignId: orders.attributedCampaignId,
      attributedAdId: orders.attributedAdId,
      totalAmount: orders.totalAmount,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      orderDate: orders.orderDate,
      workflowStatus: orders.workflowStatus,
      utmSource: orders.utmSource,
      utmMedium: orders.utmMedium,
      utmCampaign: orders.utmCampaign,
      utmContent: orders.utmContent,
      utmTerm: orders.utmTerm,
    })
    .from(orders)
    .where(and(...conditions));

  const totalOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.merchantId, merchantId));

  const campaigns = await db
    .select({ campaignId: adCampaigns.campaignId, name: adCampaigns.name, effectiveStatus: adCampaigns.effectiveStatus })
    .from(adCampaigns)
    .where(eq(adCampaigns.merchantId, merchantId));

  const ads = await db
    .select({ adId: adCreatives.adId, name: adCreatives.name, campaignId: adCreatives.campaignId })
    .from(adCreatives)
    .where(eq(adCreatives.merchantId, merchantId));

  const campaignMap = new Map(campaigns.map(c => [c.campaignId, c]));
  const adMap = new Map(ads.map(a => [a.adId, a]));

  const campaignStats: Record<string, {
    campaignId: string;
    campaignName: string;
    status: string;
    orderCount: number;
    revenue: number;
    orders: any[];
  }> = {};

  for (const order of attributedOrders) {
    const cid = order.attributedCampaignId!;
    const campaign = campaignMap.get(cid);
    if (!campaignStats[cid]) {
      campaignStats[cid] = {
        campaignId: cid,
        campaignName: campaign?.name ?? cid,
        status: campaign?.effectiveStatus ?? 'UNKNOWN',
        orderCount: 0,
        revenue: 0,
        orders: [],
      };
    }
    campaignStats[cid].orderCount++;
    campaignStats[cid].revenue += parseFloat(order.totalAmount as string || '0');
    campaignStats[cid].orders.push({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      totalAmount: order.totalAmount,
      orderDate: order.orderDate,
      workflowStatus: order.workflowStatus,
      attributedCampaignId: order.attributedCampaignId,
      attributedAdId: order.attributedAdId,
      adName: order.attributedAdId ? (adMap.get(order.attributedAdId)?.name ?? null) : null,
      utmSource: order.utmSource,
      utmMedium: order.utmMedium,
      utmCampaign: order.utmCampaign,
      utmContent: order.utmContent,
      utmTerm: order.utmTerm,
    });
  }

  return {
    totalOrders: totalOrders.length,
    attributedOrders: attributedOrders.length,
    attributionRate: totalOrders.length > 0 ? (attributedOrders.length / totalOrders.length) * 100 : 0,
    attributedRevenue: attributedOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount as string || '0'), 0),
    campaigns: Object.values(campaignStats).sort((a, b) => b.revenue - a.revenue),
  };
}
