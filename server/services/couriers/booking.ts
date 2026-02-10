import type { Order } from "@shared/schema";

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

export function orderToPacket(order: Order): BookingPacket {
  const items = order.lineItems as any[];
  const pieces = order.totalQuantity || items?.length || 1;
  const itemSummary = order.itemSummary ||
    (items ? items.map((i: any) => `${i.name || i.title} x${i.quantity || 1}`).join(", ") : "Order items");

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: normalizePhone(order.customerPhone),
    shippingAddress: order.shippingAddress || "",
    city: order.city || "",
    codAmount: parseFloat(order.totalAmount) || 0,
    weight: 200,
    pieces,
    specialInstructions: order.notes || "",
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
    const resp = await fetch("https://merchantapi.leopardscourier.com/api/getAllCities/format/json/", {
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

export async function bookLeopardsBatch(
  packets: BookingPacket[],
  credentials: { apiKey: string; apiPassword: string },
  shipperInfo: { name: string; phone: string; address: string; city: string }
): Promise<BookingResult[]> {
  const results: BookingResult[] = [];
  const cities = await loadLeopardsCities(credentials.apiKey, credentials.apiPassword);

  const originMatch = findLeopardsCity(shipperInfo.city, cities);
  const originCityId = originMatch?.id || "self";

  const leopardsPackets = packets.map((p) => {
    const mode = p.mode || "overnight";
    const destMatch = findLeopardsCity(p.city, cities);
    const destCityId = destMatch?.id;

    return {
      booked_packet_weight: String(p.weight || 200),
      booked_packet_no_piece: String(p.pieces || 1),
      booked_packet_collect_amount: String(Math.round(p.codAmount || 0)),
      booked_packet_order_id: p.orderNumber,
      origin_city: String(originCityId),
      destination_city: destCityId ? String(destCityId) : p.city,
      shipment_name_eng: shipperInfo.name || "self",
      shipment_phone: normalizePhone(shipperInfo.phone) || "self",
      shipment_address: shipperInfo.address || "self",
      consignment_name_eng: p.customerName,
      consignment_phone: p.customerPhone,
      consignment_address: p.shippingAddress,
      special_instructions: p.specialInstructions || p.itemSummary || "Handle with care",
      shipment_type: mode.toLowerCase() === "detain" ? "Detain" : (mode.toLowerCase() === "overland" ? "Overland" : "Overnight"),
    };
  });

  try {
    const requestBody = {
      api_key: credentials.apiKey,
      api_password: credentials.apiPassword,
      packets: leopardsPackets,
    };

    console.log(`[Leopards] Booking ${leopardsPackets.length} packets...`);
    console.log(`[Leopards] Sample packet:`, JSON.stringify(leopardsPackets[0], null, 2));

    const resp = await fetch("https://merchantapi.leopardscourier.com/api/bookPacket/format/json/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await resp.json();
    console.log(`[Leopards] Booking response status: ${data.status}, error: ${JSON.stringify(data.error)?.substring(0, 200)}`);

    if (data.status === 1 && data.packet_list && Array.isArray(data.packet_list)) {
      for (let i = 0; i < packets.length; i++) {
        const packet = packets[i];
        const responsePacket = data.packet_list[i];
        if (responsePacket && responsePacket.track_number) {
          results.push({
            orderId: packet.orderId,
            orderNumber: packet.orderNumber,
            success: true,
            trackingNumber: responsePacket.track_number,
            slipUrl: responsePacket.slip_link || null,
            rawResponse: responsePacket,
          });
        } else {
          results.push({
            orderId: packet.orderId,
            orderNumber: packet.orderNumber,
            success: false,
            error: responsePacket?.error || responsePacket?.status_message || "Booking failed for this packet",
            rawResponse: responsePacket,
          });
        }
      }
    } else if (data.status === 1 && data.track_number) {
      results.push({
        orderId: packets[0].orderId,
        orderNumber: packets[0].orderNumber,
        success: true,
        trackingNumber: data.track_number,
        slipUrl: data.slip_link || null,
        rawResponse: data,
      });
    } else {
      const errorMsg = data.error || data.message || "Leopards booking failed";
      const errStr = typeof errorMsg === "object" ? JSON.stringify(errorMsg) : String(errorMsg);
      for (const packet of packets) {
        results.push({
          orderId: packet.orderId,
          orderNumber: packet.orderNumber,
          success: false,
          error: errStr,
          rawResponse: data,
        });
      }
    }
  } catch (err: any) {
    console.error("[Leopards] Batch booking error:", err);
    for (const packet of packets) {
      results.push({
        orderId: packet.orderId,
        orderNumber: packet.orderNumber,
        success: false,
        error: err.message || "Network error",
      });
    }
  }

  return results;
}

// ============================================
// POSTEX BOOKING
// ============================================

export async function bookPostExOrder(
  packet: BookingPacket,
  token: string,
  shipperInfo: { name: string; phone: string; address: string; city: string }
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

    const requestBody = {
      cityName: packet.city,
      customerName: packet.customerName,
      customerPhone: phone,
      deliveryAddress: packet.shippingAddress,
      invoiceDivision: 1,
      invoicePayment: String(Math.round(packet.codAmount || 0)),
      items: packet.pieces || 1,
      orderDetail: packet.itemSummary || "Order items",
      orderRefNumber: packet.orderNumber,
      orderType,
      transactionNotes: packet.specialInstructions || "",
      pickupAddressCode: "",
      storeAddressCode: "",
    };

    console.log(`[PostEx] Booking order ${packet.orderNumber}...`);
    console.log(`[PostEx] Request:`, JSON.stringify(requestBody, null, 2));

    const resp = await fetch("https://api.postex.pk/services/integration/api/order/v3/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": token,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await resp.json();
    console.log(`[PostEx] Response:`, JSON.stringify(data).substring(0, 300));

    if (data.statusCode === "200" && data.dist?.trackingNumber) {
      return {
        orderId: packet.orderId,
        orderNumber: packet.orderNumber,
        success: true,
        trackingNumber: data.dist.trackingNumber,
        rawResponse: data,
      };
    }

    return {
      orderId: packet.orderId,
      orderNumber: packet.orderNumber,
      success: false,
      error: data.statusMessage || data.message || "PostEx booking failed",
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
  shipperInfo: { name: string; phone: string; address: string; city: string }
): Promise<BookingResult[]> {
  const results: BookingResult[] = [];

  for (let i = 0; i < packets.length; i++) {
    const result = await bookPostExOrder(packets[i], token, shipperInfo);
    results.push(result);
    if (i < packets.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}
