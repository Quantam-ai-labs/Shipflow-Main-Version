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
  { key: "{{courier_name}}", label: "Courier", description: "Courier company name" },
  { key: "{{city}}", label: "City", description: "Customer city" },
  { key: "{{address}}", label: "Address", description: "Shipping address" },
  { key: "{{new_status}}", label: "New Status", description: "New order status label" },
  { key: "{{shipping_amount}}", label: "Shipping", description: "Shipping charge amount" },
] as const;

export const DEFAULT_MESSAGE_BODIES: Record<string, string> = {
  NEW: `Hello {{name}},\n\nYour order #{{order_number}} has been received!\n\n{{items}}\n\nTotal: Rs. {{order_total}}\n\nPlease reply *Confirm* or *Cancel*.`,
  BOOKED: `Hello {{name}},\n\nYour order #{{order_number}} has been booked with {{courier_name}}.\n\n{{items}}\n\nTotal: Rs. {{order_total}}\nTracking: {{tracking_number}}\n\nThank you for shopping with us!`,
  FULFILLED: `Hello {{name}},\n\nYour order #{{order_number}} is on its way!\n\n{{items}}\n\nTracking: {{tracking_number}} ({{courier_name}})\n\nThank you for shopping with us!`,
  DELIVERED: `Hello {{name}},\n\nYour order #{{order_number}} has been delivered.\n\n{{items}}\n\nTotal: Rs. {{order_total}}\n\nThank you for shopping with us!`,
};

export const DEFAULT_MESSAGE_BODY = DEFAULT_MESSAGE_BODIES.DELIVERED;

export function getDefaultMessageBody(status?: string): string {
  if (status && DEFAULT_MESSAGE_BODIES[status]) return DEFAULT_MESSAGE_BODIES[status];
  return DEFAULT_MESSAGE_BODY;
}

export function interpolateMessageBody(
  body: string | null | undefined,
  vars: Record<string, string>,
  status?: string
): string {
  const template = body && body.trim().length > 0 ? body : getDefaultMessageBody(status);
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

export function buildTemplateParamsFromBody(
  metaTemplateBody: string,
  vars: Record<string, string>
): string[] | null {
  const paramMatches = metaTemplateBody.match(/\{\{(\d+)\}\}/g);
  if (!paramMatches || paramMatches.length === 0) return null;

  const maxParam = Math.max(...paramMatches.map(m => parseInt(m.replace(/[{}]/g, ""))));
  const params: string[] = [];

  const orderedVarNames = ["name", "order_number", "items", "order_total", "tracking_number", "courier_name", "new_status", "city", "address", "shipping_amount"];

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
    // backward-compat aliases
    customer_name: params.customerName || "Customer",
    item_name: itemsStr,
    total_amount: totalStr,
  };
}
