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
  NEW: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} has been received.\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  BOOKED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "booked".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  FULFILLED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "shipped".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
  DELIVERED: `Hello {customer_name},\n\nYour order #{order_number} of {item_name} is "delivered".\n\nThank you for shopping with lalaimports. We appreciate your trust!`,
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
}): Record<string, string> {
  return {
    customer_name: params.customerName || "Customer",
    order_number: params.orderNumber || "N/A",
    item_name: params.itemSummary || "your order",
    new_status: getStatusLabel(params.toStatus),
    old_status: getStatusLabel(params.fromStatus),
    city: params.city || "",
    address: params.shippingAddress || "",
    total_amount: params.totalAmount || "",
    courier_name: params.courierName || "",
    tracking_number: params.courierTracking || "",
  };
}
