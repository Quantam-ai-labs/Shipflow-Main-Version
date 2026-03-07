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
  { key: "{customer_name}", label: "Customer Name" },
  { key: "{order_number}", label: "Order No." },
  { key: "{item_name}", label: "Item Name" },
  { key: "{new_status}", label: "New Status" },
  { key: "{old_status}", label: "Old Status" },
  { key: "{city}", label: "City" },
  { key: "{address}", label: "Address" },
  { key: "{total_amount}", label: "Amount" },
  { key: "{courier_name}", label: "Courier" },
  { key: "{tracking_number}", label: "Tracking No." },
] as const;

export const DEFAULT_MESSAGE_BODIES: Record<string, string> = {
  NEW: `Hello {customer_name},\n\nYour order #{order_number} has been received!\n\n{item_name}\n\nTotal: Rs. {total_amount}\n\nPlease reply *Confirm* or *Cancel*.`,
  BOOKED: `Hello {customer_name},\n\nYour order #{order_number} has been booked with {courier_name}.\n\n{item_name}\n\nTotal: Rs. {total_amount}\nTracking: {tracking_number}\n\nThank you for shopping with us!`,
  FULFILLED: `Hello {customer_name},\n\nYour order #{order_number} is on its way!\n\n{item_name}\n\nTracking: {tracking_number} ({courier_name})\n\nThank you for shopping with us!`,
  DELIVERED: `Hello {customer_name},\n\nYour order #{order_number} has been delivered.\n\n{item_name}\n\nTotal: Rs. {total_amount}\n\nThank you for shopping with us!`,
};

export const DEFAULT_MESSAGE_BODY =
  DEFAULT_MESSAGE_BODIES.DELIVERED;

export function getDefaultMessageBody(status?: string): string {
  if (status && DEFAULT_MESSAGE_BODIES[status]) return DEFAULT_MESSAGE_BODIES[status];
  return DEFAULT_MESSAGE_BODY;
}

export function interpolateMessageBody(
  body: string | null | undefined,
  vars: Record<string, string>,
  status?: string
): string {
  const template =
    body && body.trim().length > 0 ? body : getDefaultMessageBody(status);
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function buildItemLines(
  lineItems?: Array<{ name: string; quantity: number; price: number; variantTitle?: string | null }> | null,
  itemSummary?: string | null
): string {
  if (lineItems && lineItems.length > 0) {
    return lineItems.map(item => {
      const variant = item.variantTitle ? ` - ${item.variantTitle}` : "";
      const total = (item.price * item.quantity).toLocaleString("en-PK");
      return `• ${item.name}${variant} x${item.quantity} @ Rs.${total}`;
    }).join("\n");
  }
  return itemSummary || "your order";
}

const META_TEMPLATE_PARAMS: Record<string, (vars: Record<string, string>) => string[]> = {
  order_confirmation: (vars) => [
    vars.customer_name || "Customer",
    vars.item_name || "your order",
  ],
  order_update: (vars) => [
    vars.customer_name || "Customer",
    vars.order_number || "N/A",
    vars.new_status || "updated",
  ],
};

export function buildTemplateParams(
  templateName: string,
  vars: Record<string, string>
): string[] | null {
  const builder = META_TEMPLATE_PARAMS[templateName];
  return builder ? builder(vars) : null;
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
  return {
    customer_name: params.customerName || "Customer",
    order_number: params.orderNumber || "N/A",
    item_name: buildItemLines(params.lineItems, params.itemSummary),
    new_status: getStatusLabel(params.toStatus),
    old_status: getStatusLabel(params.fromStatus),
    city: params.city || "",
    address: params.shippingAddress || "",
    total_amount: params.totalAmount ? Number(params.totalAmount).toLocaleString("en-PK") : "",
    courier_name: params.courierName || "",
    tracking_number: params.courierTracking || "",
  };
}
