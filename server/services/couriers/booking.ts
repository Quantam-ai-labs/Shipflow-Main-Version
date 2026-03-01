import type { Order } from "@shared/schema";

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return resp;
    } catch (err: any) {
      const isTransient =
        err.name === "AbortError" ||
        err.code === "ECONNRESET" ||
        err.code === "ECONNREFUSED" ||
        err.code === "ETIMEDOUT" ||
        err.message?.includes("fetch failed") ||
        err.message?.includes("network");
      if (!isTransient || attempt === maxRetries) throw err;
      const delay = 1000 * (attempt + 1);
      console.warn(`[Booking] Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

export interface BookingPacket {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  codAmount: number;
  weight: number;
  pieces: number;
  specialInstructions: string;
  itemSummary: string;
  mode?: string;
}

export interface BookingResult {
  orderId: string;
  orderNumber: string;
  success: boolean;
  trackingNumber?: string;
  slipUrl?: string;
  error?: string;
  rawResponse?: any;
}

export interface ValidationError {
  orderId: string;
  orderNumber: string;
  missingFields: string[];
}

interface LeopardsCityEntry {
  id: number;
  name: string;
  shipmentTypes: string[];
}

interface PostExCityEntry {
  name: string;
  isPickupCity: boolean;
  isDeliveryCity: boolean;
}

interface CourierCityCache {
  cities: LeopardsCityEntry[] | PostExCityEntry[];
  cityMap: Map<string, any>;
  loadedAt: number;
}

const cityCache = new Map<string, CourierCityCache>();
const CITY_CACHE_TTL = 24 * 60 * 60 * 1000;

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[\s\-\(\)\.+]/g, "");
  if (cleaned.startsWith("92")) cleaned = "0" + cleaned.slice(2);
  if (cleaned.startsWith("0092")) cleaned = "0" + cleaned.slice(4);
  if (cleaned.startsWith("+92")) cleaned = "0" + cleaned.slice(3);
  if (!cleaned.startsWith("0") && cleaned.length === 10) cleaned = "0" + cleaned;
  return cleaned;
}

export function validateOrderForBooking(order: Order): string[] {
  const missing: string[] = [];
  if (!order.customerName || order.customerName === "Unknown") missing.push("Customer Name");
  if (!order.customerPhone) missing.push("Phone");
  if (!order.shippingAddress) missing.push("Address");
  if (!order.city) missing.push("City");
  if (!order.totalAmount || parseFloat(order.totalAmount) <= 0) missing.push("Amount");
  return missing;
}

export const COURIER_SPECIAL_INSTRUCTIONS = "Allow Open Parcel - Must Call Before Delivery - Handle With Care";

export function orderToPacket(order: Order): BookingPacket {
  const items = order.lineItems as any[];
  const pieces = order.totalQuantity || items?.length || 1;
  const itemSummary = items && items.length > 0
    ? items.map((i: any) => {
        const name = (i.name || i.title || "Item").trim();
        const variant = (i.variantTitle || i.variant_title) ? ` - ${i.variantTitle || i.variant_title}` : "";
        const qty = ` x ${i.quantity || 1}`;
        return `${name}${variant}${qty}`;
      }).join(" | ")
    : (order.itemSummary || "Order items");

  const notesParts: string[] = [];
  if (order.notes) notesParts.push(order.notes);
  notesParts.push(COURIER_SPECIAL_INSTRUCTIONS);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: normalizePhone(order.customerPhone),
    shippingAddress: order.shippingAddress || "",
    city: order.city || "",
    codAmount: parseFloat(order.codRemaining ?? order.totalAmount) || 0,
    weight: 200,
    pieces,
    specialInstructions: notesParts.join(" - "),
    itemSummary,
  };
}

// ============================================
// LEOPARDS CITY FUNCTIONS
// ============================================

export async function loadLeopardsCities(apiKey: string, apiPassword: string): Promise<LeopardsCityEntry[]> {
  const cacheKey = `leopards_${apiKey}`;
  const cached = cityCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CITY_CACHE_TTL) {
    return cached.cities as LeopardsCityEntry[];
  }

  try {
    const resp = await fetchWithRetry("https://merchantapi.leopardscourier.com/api/getAllCities/format/json/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, api_password: apiPassword }),
    });
    const data = await resp.json();

    const cities: LeopardsCityEntry[] = [];
    const cityMap = new Map<string, number>();
    if (data.status === 1 && data.city_list) {
      for (const c of data.city_list) {
        const name = (c.name || "").trim();
        if (name && c.id) {
          cities.push({
            id: parseInt(c.id),
            name,
            shipmentTypes: Array.isArray(c.shipment_type) ? c.shipment_type : [],
          });
          cityMap.set(name.toLowerCase(), parseInt(c.id));
        }
      }
    }

    cityCache.set(cacheKey, { cities, cityMap, loadedAt: Date.now() });
    console.log(`[Leopards] Loaded ${cities.length} cities`);
    return cities;
  } catch (err) {
    console.error("[Leopards] Failed to load cities:", err);
    return [];
  }
}

export function findLeopardsCity(cityName: string, cities: LeopardsCityEntry[]): LeopardsCityEntry | null {
  const normalized = cityName.toLowerCase().trim();
  const exact = cities.find(c => c.name.toLowerCase() === normalized);
  if (exact) return exact;
  const partial = cities.find(c => c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase()));
  if (partial) return partial;
  return null;
}

export function matchCityForCourier(
  orderCity: string,
  courierCities: Array<{ id?: number; name: string }>,
  courier: string
): { matched: boolean; matchedCity: string; matchedCityId?: number } {
  if (!orderCity) return { matched: false, matchedCity: "" };
  const normalized = orderCity.toLowerCase().trim();

  for (const c of courierCities) {
    if (c.name.toLowerCase().trim() === normalized) {
      return { matched: true, matchedCity: c.name, matchedCityId: (c as any).id };
    }
  }

  for (const c of courierCities) {
    const cName = c.name.toLowerCase().trim();
    if (cName.includes(normalized) || normalized.includes(cName)) {
      return { matched: true, matchedCity: c.name, matchedCityId: (c as any).id };
    }
  }

  return { matched: false, matchedCity: orderCity };
}

// ============================================
// POSTEX CITY FUNCTIONS
// ============================================

export async function loadPostExCities(token: string): Promise<PostExCityEntry[]> {
  const cacheKey = `postex_${token.substring(0, 10)}`;
  const cached = cityCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CITY_CACHE_TTL) {
    return cached.cities as PostExCityEntry[];
  }

  try {
    const resp = await fetch("https://api.postex.pk/services/integration/api/order/v2/get-operational-city", {
      method: "GET",
      headers: { "token": token },
    });
    const data = await resp.json();

    const cities: PostExCityEntry[] = [];
    const cityMap = new Map<string, string>();
    if (data.statusCode === "200" && data.dist) {
      for (const c of data.dist) {
        const name = (c.operationalCityName || "").trim();
        if (name) {
          cities.push({
            name,
            isPickupCity: c.isPickupCity === "true" || c.isPickupCity === true,
            isDeliveryCity: c.isDeliveryCity === "true" || c.isDeliveryCity === true,
          });
          cityMap.set(name.toLowerCase(), name);
        }
      }
    }

    cityCache.set(cacheKey, { cities, cityMap, loadedAt: Date.now() });
    console.log(`[PostEx] Loaded ${cities.length} cities`);
    return cities;
  } catch (err) {
    console.error("[PostEx] Failed to load cities:", err);
    return [];
  }
}

// ============================================
// LEOPARDS BOOKING
// ============================================

export async function bookLeopardsPacket(
  packet: BookingPacket,
  credentials: { apiKey: string; apiPassword: string },
  shipperInfo: { name: string; phone: string; address: string; city: string; shipperId?: string },
  cities: LeopardsCityEntry[]
): Promise<BookingResult> {
  const originMatch = findLeopardsCity(shipperInfo.city, cities);
  const originCityId = originMatch?.id || 0;
  const mode = packet.mode || "Overnight";
  const destMatch = findLeopardsCity(packet.city, cities);
  const destCityId = destMatch?.id;

  const requestBody: Record<string, string> = {
    api_key: credentials.apiKey,
    api_password: credentials.apiPassword,
    booked_packet_weight: String(packet.weight || 200),
    booked_packet_no_piece: String(packet.pieces || 1),
    booked_packet_collect_amount: String(Math.round(packet.codAmount || 0)),
    booked_packet_order_id: packet.orderNumber,
    origin_city: String(originCityId),
    destination_city: destCityId ? String(destCityId) : packet.city,
    ...(shipperInfo.shipperId ? {
      shipment_id: shipperInfo.shipperId,
    } : {
      shipment_name_eng: shipperInfo.name || "1SOL.AI Merchant",
      shipment_phone: normalizePhone(shipperInfo.phone) || "0000000000",
      shipment_address: shipperInfo.address || "Default Address",
    }),
    consignment_name_eng: packet.customerName || "Customer",
    consignment_phone: normalizePhone(packet.customerPhone) || "0000000000",
    consignment_address: packet.shippingAddress || "Address",
    special_instructions: packet.specialInstructions || packet.itemSummary || "Handle with care",
    shipment_type: mode.toLowerCase() === "detain" ? "Detain" : (mode.toLowerCase() === "overland" ? "Overland" : "Overnight"),
  };

  try {
    console.log(`[Leopards] Booking order ${packet.orderNumber}...`);
    console.log(`[Leopards] Request body:`, JSON.stringify(requestBody, null, 2));

    const resp = await fetchWithRetry("https://merchantapi.leopardscourier.com/api/bookPacket/format/json/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await resp.json();
    console.log(`[Leopards] Response for ${packet.orderNumber}: status=${data.status}, track=${data.track_number || "none"}, error=${JSON.stringify(data.error)?.substring(0, 300)}`);

    if (data.status === 1 && data.track_number) {
      return {
        orderId: packet.orderId,
        orderNumber: packet.orderNumber,
        success: true,
        trackingNumber: data.track_number,
        slipUrl: data.slip_link || null,
        rawResponse: data,
      };
    }

    const errorMsg = data.error || data.message || "Leopards booking failed";
    const errStr = typeof errorMsg === "object"
      ? Object.values(errorMsg).flat().join(", ")
      : String(errorMsg);

    return {
      orderId: packet.orderId,
      orderNumber: packet.orderNumber,
      success: false,
      error: errStr,
      rawResponse: data,
    };
  } catch (err: any) {
    console.error(`[Leopards] Booking error for ${packet.orderNumber}:`, err);
    return {
      orderId: packet.orderId,
      orderNumber: packet.orderNumber,
      success: false,
      error: err.message || "Network error",
    };
  }
}

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  concurrency: number
): Promise<any[]> {
  const results: any[] = new Array(items.length);
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }
  return results;
}

export async function bookLeopardsBatch(
  packets: BookingPacket[],
  credentials: { apiKey: string; apiPassword: string },
  shipperInfo: { name: string; phone: string; address: string; city: string; shipperId?: string }
): Promise<BookingResult[]> {
  const cities = await loadLeopardsCities(credentials.apiKey, credentials.apiPassword);

  console.log(`[Leopards] Booking ${packets.length} packets with concurrency 3...`);

  return runWithConcurrency(packets, (pkt) => bookLeopardsPacket(pkt, credentials, shipperInfo, cities), 3);
}

// ============================================
// POSTEX BOOKING
// ============================================

export async function bookPostExOrder(
  packet: BookingPacket,
  token: string,
  shipperInfo: { name: string; phone: string; address: string; city: string; pickupAddressCode?: string; storeAddressCode?: string }
): Promise<BookingResult> {
  try {
    const phone = packet.customerPhone;
    if (!/^0[3]\d{9}$/.test(phone)) {
      return {
        orderId: packet.orderId,
        orderNumber: packet.orderNumber,
        success: false,
        error: `Invalid phone format: ${phone}. Must be 03xxxxxxxxx`,
      };
    }

    const mode = packet.mode || "Normal";
    const orderType = mode === "Reversed" ? "Reverse" :
                      mode === "Replacement" ? "Replacement" : "Normal";

    const safePickup = shipperInfo.pickupAddressCode ? String(shipperInfo.pickupAddressCode).trim() : "";
    const safeStore = shipperInfo.storeAddressCode ? String(shipperInfo.storeAddressCode).trim() : "";

    const requestBody: Record<string, any> = {
      cityName: packet.city,
      customerName: packet.customerName,
      customerPhone: phone,
      deliveryAddress: packet.shippingAddress,
      invoiceDivision: 1,
      invoicePayment: Math.round(packet.codAmount || 0),
      items: packet.pieces || 1,
      orderDetail: packet.itemSummary || "Order items",
      orderRefNumber: packet.orderNumber,
      orderType,
      transactionNotes: packet.specialInstructions || "",
    };
    if (safePickup) requestBody.pickupAddressCode = safePickup;

    console.log(`[PostEx] POSTEX create-order payload: pickupAddressCode=${safePickup} (type=${typeof safePickup})`);
    console.log(`[PostEx] Full request payload keys: ${Object.keys(requestBody).join(', ')}`);
    console.log(`[PostEx] Full request:`, JSON.stringify(requestBody, null, 2));

    const resp = await fetchWithRetry("https://api.postex.pk/services/integration/api/order/v3/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": token,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await resp.json();

    if (data.statusCode === "200" && data.dist?.trackingNumber) {
      console.log(`[PostEx] SUCCESS for ${packet.orderNumber}: trackingNumber=${data.dist.trackingNumber}`);
      return {
        orderId: packet.orderId,
        orderNumber: packet.orderNumber,
        success: true,
        trackingNumber: data.dist.trackingNumber,
        rawResponse: data,
      };
    }

    const errorMsg = data.statusMessage || data.message || "PostEx booking failed";
    console.error(`[PostEx] FAILED for ${packet.orderNumber}: ${errorMsg}`, JSON.stringify(data).substring(0, 500));
    return {
      orderId: packet.orderId,
      orderNumber: packet.orderNumber,
      success: false,
      error: errorMsg,
      rawResponse: data,
    };
  } catch (err: any) {
    console.error("[PostEx] Booking error:", err);
    return {
      orderId: packet.orderId,
      orderNumber: packet.orderNumber,
      success: false,
      error: err.message || "Network error",
    };
  }
}

export async function bookPostExBulk(
  packets: BookingPacket[],
  token: string,
  shipperInfo: { name: string; phone: string; address: string; city: string; pickupAddressCode?: string; storeAddressCode?: string }
): Promise<BookingResult[]> {
  console.log(`[PostEx] Booking ${packets.length} packets with concurrency 3...`);

  return runWithConcurrency(packets, (pkt) => bookPostExOrder(pkt, token, shipperInfo), 3);
}
