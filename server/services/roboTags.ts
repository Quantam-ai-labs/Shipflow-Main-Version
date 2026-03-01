import { db } from "../db";
import { merchants } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface RoboTagConfig {
  confirm: string;
  pending: string;
  cancel: string;
}

export const DEFAULT_ROBO_TAGS: RoboTagConfig = { confirm: "Robo-Confirm", pending: "Robo-Pending", cancel: "Robo-Cancel" };

export async function getMerchantRoboTags(merchantId: string): Promise<RoboTagConfig> {
  const [merchant] = await db.select({ roboTags: merchants.roboTags }).from(merchants).where(eq(merchants.id, merchantId));
  if (!merchant?.roboTags) return DEFAULT_ROBO_TAGS;
  const tags = merchant.roboTags as any;
  return {
    confirm: tags.confirm || DEFAULT_ROBO_TAGS.confirm,
    pending: tags.pending || DEFAULT_ROBO_TAGS.pending,
    cancel: tags.cancel || DEFAULT_ROBO_TAGS.cancel,
  };
}
