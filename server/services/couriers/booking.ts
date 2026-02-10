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

interface LeopardsCityCache {
  cities: Map<string, number>;
  loadedAt: number;
}

const cityCache = new Map<string, LeopardsCityCache>();
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
    codAmount: order.paymentMethod === "cod" ? parseFloat(order.totalAmount) : 0,
    weight: 200,
    pieces,
    specialInstructions: order.notes || "",
    itemSummary,
  };
}

// ============================================
// LEOPARDS BOOKING
// ============================================

async function loadLeopardsCities(apiKey: string, apiPassword: string): Promise<Map<string, number>> {
  const cacheKey = `${apiKey}`;
  const cached = cityCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CITY_CACHE_TTL) {
    return cached.cities;
  }

  try {
    const resp = await fetch("https://merchantapi.leopardscourier.com/api/getAllCities/format/json/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, api_password: apiPassword }),
    });
    const data = await resp.json();

    const cities = new Map<string, number>();
    if (data.status === 1 && data.city_list) {
      for (const c of data.city_list) {
        const name = (c.name || "").toLowerCase().trim();
        if (name && c.id) cities.set(name, parseInt(c.id));
      }
    }

    cityCache.set(cacheKey, { cities, loadedAt: Date.now() });
    console.log(`[Leopards] Loaded ${cities.size} cities`);
    return cities;
  } catch (err) {
    console.error("[Leopards] Failed to load cities:", err);
    return new Map();
  }
}

function findLeopardsCity(cityName: string, cityMap: Map<string, number>): number | null {
  const normalized = cityName.toLowerCase().trim();
  if (cityMap.has(normalized)) return cityMap.get(normalized)!;
  const entries = Array.from(cityMap.entries());
  for (const [name, id] of entries) {
    if (name.includes(normalized) || normalized.includes(name)) return id;
  }
  return null;
}

export async function bookLeopardsBatch(
  packets: BookingPacket[],
  credentials: { apiKey: string; apiPassword: string },
  shipperInfo: { name: string; phone: string; address: string; city: string }
): Promise<BookingResult[]> {
  const results: BookingResult[] = [];
  const cityMap = await loadLeopardsCities(credentials.apiKey, credentials.apiPassword);

  const originCityId = findLeopardsCity(shipperInfo.city, cityMap);

  const leopardsPackets = packets.map((p) => {
    const destCityId = findLeopardsCity(p.city, cityMap);
    const mode = (p as any).mode || "overnight";
    return {
      booked_packet_weight: p.weight,
      booked_packet_no_piece: p.pieces,
      booked_packet_collect_amount: p.codAmount,
      booked_packet_order_id: p.orderNumber,
      origin_city: originCityId || "self",
      destination_city: destCityId || p.city,
      shipment_name_eng: shipperInfo.name,
      shipment_phone: normalizePhone(shipperInfo.phone),
      shipment_address: shipperInfo.address,
      consignment_name_eng: p.customerName,
      consignment_phone: p.customerPhone,
      consignment_address: p.shippingAddress,
      special_instructions: p.specialInstructions || p.itemSummary || "Handle with care",
      shipment_type: p.codAmount > 0 ? "COD" : "Detain",
      booked_packet_shipment_type: mode === "overland" ? "Overland" : "Overnight",
    };
  });

  try {
    const requestBody = {
      api_key: credentials.apiKey,
      api_password: credentials.apiPassword,
      packets: leopardsPackets,
    };

    console.log(`[Leopards] Booking ${leopardsPackets.length} packets...`);
    const resp = await fetch("https://merchantapi.leopardscourier.com/api/bookPacket/format/json/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await resp.json();
    console.log(`[Leopards] Booking response status: ${data.status}`);

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
      for (const packet of packets) {
        results.push({
          orderId: packet.orderId,
          orderNumber: packet.orderNumber,
          success: false,
          error: typeof errorMsg === "object" ? JSON.stringify(errorMsg) : errorMsg,
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

    const requestBody = {
      cityName: packet.city,
      customerName: packet.customerName,
      customerPhone: phone,
      deliveryAddress: packet.shippingAddress,
      invoiceDivision: 1,
      invoicePayment: packet.codAmount,
      items: packet.pieces,
      orderDetail: packet.itemSummary || "Order items",
      orderRefNumber: packet.orderNumber,
      orderType: "Normal",
      transactionNotes: packet.specialInstructions || "",
      pickupAddressCode: "",
      storeAddressCode: "",
    };

    console.log(`[PostEx] Booking order ${packet.orderNumber}...`);
    const resp = await fetch("https://api.postex.pk/services/integration/api/order/v3/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": token,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await resp.json();

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
