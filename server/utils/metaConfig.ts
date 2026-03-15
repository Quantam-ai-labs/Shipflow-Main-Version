import { db } from "../db";
import { platformSettings } from "@shared/schema";

let cachedSettings: any = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

async function getSettings() {
  if (cachedSettings && Date.now() - cacheTime < CACHE_TTL) return cachedSettings;
  const [settings] = await db.select().from(platformSettings).limit(1);
  cachedSettings = settings || {};
  cacheTime = Date.now();
  return cachedSettings;
}

export function clearMetaConfigCache() {
  cachedSettings = null;
  cacheTime = 0;
}

export async function getMetaConfig() {
  const s = await getSettings();
  return {
    facebookAppId: s.metaFacebookAppId || process.env.FACEBOOK_APP_ID || "",
    facebookAppSecret: s.metaFacebookAppSecret || process.env.FACEBOOK_APP_SECRET || "",
    whatsappEmbeddedSignupConfigId: s.metaWhatsappEmbeddedSignupConfigId || process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || "",
    whatsappVerifyToken: s.metaWhatsappVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || "",
  };
}
