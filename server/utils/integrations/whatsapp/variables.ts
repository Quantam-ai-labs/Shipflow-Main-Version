export const WA_NOTIFY_STATUSES = ["NEW", "BOOKED", "FULFILLED", "DELIVERED"] as const;
export type WaNotifyStatus = typeof WA_NOTIFY_STATUSES[number];

export const STATUS_LABELS: Record<string, string> = {
  NEW: "New Order",
  BOOKED: "Booked",
  FULFILLED: "Shipped",
  DELIVERED: "Delivered",
  PENDING: "Pending",
  HOLD: "On Hold",
  READY_TO_SHIP: "Ready to Ship",
  RETURN: "Returned",
  CANCELLED: "Cancelled",
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export const WA_VARIABLE_CHIPS = [
  { key: "{{name}}", label: "Customer Name", description: "Customer's full name" },
  { key: "{{order_number}}", label: "Order No.", description: "Order number (e.g., #1001)" },
  { key: "{{order_total}}", label: "Order Total", description: "Order total with currency" },
  { key: "{{items}}", label: "Items", description: "Product name - variant x qty || ..." },
  { key: "{{tracking_number}}", label: "Tracking No.", description: "Courier tracking number" },
  { key: "{{tracking_link}}", label: "Tracking Link", description: "Full clickable tracking URL (Leopards or PostEx)" },
  { key: "{{courier_name}}", label: "Courier", description: "Courier company name" },
  { key: "{{city}}", label: "City", description: "Customer city" },
  { key: "{{address}}", label: "Address", description: "Shipping address" },
  { key: "{{new_status}}", label: "New Status", description: "New order status label" },
  { key: "{{shipping_amount}}", label: "Shipping", description: "Shipping charge amount" },
] as const;

export function buildTrackingLink(courierName?: string | null, trackingNumber?: string | null): string {
  if (!trackingNumber) return "";
  const name = (courierName || "").toLowerCase();
  if (name.includes("leopard")) {
    return `https://merchantapi.leopardscourier.com/track?no=${encodeURIComponent(trackingNumber)}`;
  }
  if (name.includes("postex")) {
    return `https://postex.pk/tracking?cn=${encodeURIComponent(trackingNumber)}`;
  }
  return "";
}

export function interpolateMessageBody(
  body: string | null | undefined,
  vars: Record<string, string>,
): string {
  const template = body && body.trim().length > 0 ? body : "";
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
    .replace(/\{(\w+)\}/g, (_, key) => {
      const aliasMap: Record<string, string> = {
        customer_name: "name",
        item_name: "items",
        total_amount: "order_total",
      };
      const mapped = aliasMap[key] ?? key;
      return vars[mapped] ?? vars[key] ?? `{${key}}`;
    });
}

function buildItemLines(
  lineItems?: Array<{ name: string; quantity: number; price: number; variantTitle?: string | null }> | null,
  itemSummary?: string | null
): string {
  if (lineItems && lineItems.length > 0) {
    return lineItems.map(item => {
      const variant = item.variantTitle ? ` - ${item.variantTitle}` : "";
      return `${item.name}${variant} x${item.quantity}`;
    }).join(" || ");
  }
  return itemSummary || "your order";
}

export const DEFAULT_VAR_ORDER = ["name", "order_number", "items", "order_total", "tracking_number", "tracking_link", "courier_name", "new_status", "city", "address", "shipping_amount"];

export function buildTemplateParamsFromBody(
  metaTemplateBody: string,
  vars: Record<string, string>,
  variableOrder?: string[] | null
): string[] | null {
  const paramMatches = metaTemplateBody.match(/\{\{(\d+)\}\}/g);
  if (!paramMatches || paramMatches.length === 0) return null;

  const maxParam = Math.max(...paramMatches.map(m => parseInt(m.replace(/[{}]/g, ""))));
  const params: string[] = [];

  const orderedVarNames = variableOrder && variableOrder.length > 0 ? variableOrder : DEFAULT_VAR_ORDER;

  for (let i = 0; i < maxParam; i++) {
    if (i < orderedVarNames.length) {
      params.push(vars[orderedVarNames[i]] || "-");
    } else {
      params.push("-");
    }
  }

  return params;
}

export function extractMessageTextParams(
  messageText: string,
  vars: Record<string, string>
): string[] | null {
  const placeholders = messageText.match(/\{\{(\w+)\}\}/g);
  if (!placeholders || placeholders.length === 0) return null;

  const aliasMap: Record<string, string> = {
    customer_name: "name",
    item_name: "items",
    total_amount: "order_total",
  };

  return placeholders.map(p => {
    const key = p.replace(/[{}]/g, "");
    const mapped = aliasMap[key] ?? key;
    return vars[mapped] ?? vars[key] ?? "-";
  });
}

export function buildVarsFromParams(params: {
  customerName: string;
  orderNumber: string;
  fromStatus: string;
  toStatus: string;
  city?: string | null;
  shippingAddress?: string | null;
  totalAmount?: string | null;
  courierName?: string | null;
  courierTracking?: string | null;
  itemSummary?: string | null;
  lineItems?: Array<{ name: string; quantity: number; price: number; variantTitle?: string | null; sku?: string | null }> | null;
}): Record<string, string> {
  const itemSubtotal =
    params.lineItems && params.lineItems.length > 0
      ? params.lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
      : 0;
  const grandTotal = params.totalAmount ? Number(params.totalAmount) : 0;
  const shippingCharge = grandTotal > 0 && itemSubtotal > 0 ? grandTotal - itemSubtotal : 0;

  const itemsStr = buildItemLines(params.lineItems, params.itemSummary);
  const totalStr = grandTotal > 0 ? grandTotal.toLocaleString("en-PK") : "";
  const shippingStr = shippingCharge > 0 ? shippingCharge.toLocaleString("en-PK") : "";

  return {
    name: params.customerName || "Customer",
    order_number: params.orderNumber || "N/A",
    items: itemsStr,
    order_total: totalStr,
    new_status: getStatusLabel(params.toStatus),
    old_status: getStatusLabel(params.fromStatus),
    city: params.city || "",
    address: params.shippingAddress || "",
    shipping_amount: shippingStr,
    courier_name: params.courierName || "",
    tracking_number: params.courierTracking || "",
    tracking_link: buildTrackingLink(params.courierName, params.courierTracking),
    // backward-compat aliases
    customer_name: params.customerName || "Customer",
    item_name: itemsStr,
    total_amount: totalStr,
  };
}
