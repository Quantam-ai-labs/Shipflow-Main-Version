export const UNIVERSAL_STATUSES = [
  'BOOKED',
  'PICKED_UP',
  'ARRIVED_AT_ORIGIN',
  'IN_TRANSIT',
  'ARRIVED_AT_DESTINATION',
  'OUT_FOR_DELIVERY',
  'DELIVERY_ATTEMPTED',
  'DELIVERED',
  'DELIVERY_FAILED',
  'READY_FOR_RETURN',
  'RETURN_IN_TRANSIT',
  'RETURNED_TO_SHIPPER',
  'CANCELLED',
] as const;

export type UniversalStatus = typeof UNIVERSAL_STATUSES[number];

const FINAL_STATUSES: UniversalStatus[] = ['DELIVERED', 'RETURNED_TO_SHIPPER', 'CANCELLED'];

const POSTEX_STATUS_MAP: Record<string, UniversalStatus> = {
  'unbooked': 'BOOKED',
  'booked': 'BOOKED',
  'consignment booked': 'BOOKED',
  'pending': 'BOOKED',
  'at merchant\'s warehouse': 'PICKED_UP',
  'picked up': 'PICKED_UP',
  'at postex warehouse': 'ARRIVED_AT_ORIGIN',
  'arrived at postex warehouse': 'ARRIVED_AT_ORIGIN',
  'package on route': 'IN_TRANSIT',
  'in transit': 'IN_TRANSIT',
  'dispatched': 'IN_TRANSIT',
  'in transit to destination': 'IN_TRANSIT',
  'shipment in transit': 'IN_TRANSIT',
  'arrived at destination hub': 'ARRIVED_AT_DESTINATION',
  'arrived at destination': 'ARRIVED_AT_DESTINATION',
  'at destination hub': 'ARRIVED_AT_DESTINATION',
  'out for delivery': 'OUT_FOR_DELIVERY',
  'attempt made': 'DELIVERY_ATTEMPTED',
  'delivery attempt': 'DELIVERY_ATTEMPTED',
  'delivery attempted': 'DELIVERY_ATTEMPTED',
  'delivered': 'DELIVERED',
  'delivered to customer': 'DELIVERED',
  'delivery under review': 'DELIVERY_FAILED',
  'delivery failed': 'DELIVERY_FAILED',
  'refused': 'DELIVERY_FAILED',
  'not accepted': 'DELIVERY_FAILED',
  'ready for return': 'READY_FOR_RETURN',
  'waiting for return': 'READY_FOR_RETURN',
  'return process initiated': 'READY_FOR_RETURN',
  'return in transit': 'RETURN_IN_TRANSIT',
  'being return': 'RETURN_IN_TRANSIT',
  'being returned': 'RETURN_IN_TRANSIT',
  'return dispatched': 'RETURN_IN_TRANSIT',
  'returned': 'RETURNED_TO_SHIPPER',
  'returned to shipper': 'RETURNED_TO_SHIPPER',
  'returned at merchant warehouse': 'RETURNED_TO_SHIPPER',
  'returned to merchant': 'RETURNED_TO_SHIPPER',
  'cancelled': 'CANCELLED',
  'booking cancelled by merchant': 'CANCELLED',
  'booking cancelled by merchant ': 'CANCELLED',
  'order cancelled': 'CANCELLED',
};

const LEOPARDS_STATUS_MAP: Record<string, UniversalStatus> = {
  'booking created': 'BOOKED',
  'booked': 'BOOKED',
  'shipment created': 'BOOKED',
  'pickup request not send': 'BOOKED',
  'pickup request sent': 'BOOKED',
  'packet not found in system': 'BOOKED',
  'picked up': 'PICKED_UP',
  'assign to courier': 'PICKED_UP',
  'assigned to courier': 'PICKED_UP',
  'pickup done': 'PICKED_UP',
  'at origin facility': 'ARRIVED_AT_ORIGIN',
  'arrived at station': 'ARRIVED_AT_ORIGIN',
  'arrived at origin': 'ARRIVED_AT_ORIGIN',
  'at station': 'ARRIVED_AT_ORIGIN',
  'in transit': 'IN_TRANSIT',
  'dispatched': 'IN_TRANSIT',
  'dispatched to destination': 'IN_TRANSIT',
  'in transit to destination': 'IN_TRANSIT',
  'shipment in transit': 'IN_TRANSIT',
  'arrived at destination': 'ARRIVED_AT_DESTINATION',
  'at destination': 'ARRIVED_AT_DESTINATION',
  'arrived at destination station': 'ARRIVED_AT_DESTINATION',
  'out for delivery': 'OUT_FOR_DELIVERY',
  'enroute for delivery': 'OUT_FOR_DELIVERY',
  'delivery attempted': 'DELIVERY_ATTEMPTED',
  'attempt failed': 'DELIVERY_ATTEMPTED',
  'delivery attempt': 'DELIVERY_ATTEMPTED',
  'delivered': 'DELIVERED',
  'undelivered': 'DELIVERY_FAILED',
  'failed': 'DELIVERY_FAILED',
  'delivery failed': 'DELIVERY_FAILED',
  'refused': 'DELIVERY_FAILED',
  'not delivered': 'DELIVERY_FAILED',
  'ready for return': 'READY_FOR_RETURN',
  'waiting for return': 'READY_FOR_RETURN',
  'return process initiated': 'READY_FOR_RETURN',
  'return in transit': 'RETURN_IN_TRANSIT',
  'return dispatched': 'RETURN_IN_TRANSIT',
  'being returned': 'RETURN_IN_TRANSIT',
  'returned to shipper': 'RETURNED_TO_SHIPPER',
  'returned': 'RETURNED_TO_SHIPPER',
  'return completed': 'RETURNED_TO_SHIPPER',
  'cancelled': 'CANCELLED',
  'shipment cancelled': 'CANCELLED',
};

function keywordFallback(rawStatus: string): UniversalStatus | null {
  const s = rawStatus.toLowerCase();

  if (s.includes('delivered') && !s.includes('un') && !s.includes('not') && !s.includes('fail') && !s.includes('attempt')) return 'DELIVERED';
  if (s.includes('deliver') && (s.includes('success') || s.includes('completed'))) return 'DELIVERED';
  if (s.includes('out') && s.includes('delivery')) return 'OUT_FOR_DELIVERY';
  if (s.includes('attempt')) return 'DELIVERY_ATTEMPTED';
  if (s.includes('undeliver') || (s.includes('delivery') && s.includes('fail'))) return 'DELIVERY_FAILED';
  if (s.includes('refused') || s.includes('not accepted')) return 'DELIVERY_FAILED';
  if (s.includes('return') && (s.includes('shipper') || s.includes('merchant') || s.includes('completed'))) return 'RETURNED_TO_SHIPPER';
  if (s.includes('return') && s.includes('transit')) return 'RETURN_IN_TRANSIT';
  if (s.includes('return') && (s.includes('ready') || s.includes('waiting') || s.includes('initiated') || s.includes('process'))) return 'READY_FOR_RETURN';
  if (s.includes('return') && (s.includes('being') || s.includes('dispatched'))) return 'RETURN_IN_TRANSIT';
  if (s.includes('return to ')) return 'RETURN_IN_TRANSIT';
  if (s.includes('cancel')) return 'CANCELLED';
  if (s.includes('arrived') && s.includes('destination')) return 'ARRIVED_AT_DESTINATION';
  if (s.includes('destination')) return 'ARRIVED_AT_DESTINATION';
  if (s.includes('arrived') || s.includes('at station') || s.includes('at hub')) return 'ARRIVED_AT_ORIGIN';
  if (s.includes('in transit') || s.includes('dispatched') || s.includes('on route') || s.includes('in-transit')) return 'IN_TRANSIT';
  if (s.includes('picked up') || s.includes('pickup done') || s.includes('assign')) return 'PICKED_UP';
  if (s.includes('booked') || s.includes('booking') || s.includes('created') || s.includes('pending')) return 'BOOKED';

  return null;
}

export type CourierType = 'leopards' | 'postex';

function getCourierMap(courier: CourierType): Record<string, UniversalStatus> {
  return courier === 'leopards' ? LEOPARDS_STATUS_MAP : POSTEX_STATUS_MAP;
}

export function normalizeStatus(
  rawStatus: string,
  courier: CourierType,
  currentStatus?: string | null,
): { normalizedStatus: UniversalStatus; mapped: boolean } {
  if (currentStatus && FINAL_STATUSES.includes(currentStatus as UniversalStatus)) {
    return { normalizedStatus: currentStatus as UniversalStatus, mapped: true };
  }

  const map = getCourierMap(courier);
  const key = rawStatus.toLowerCase().trim();

  const directMatch = map[key];
  if (directMatch) {
    return { normalizedStatus: directMatch, mapped: true };
  }

  for (const [mapKey, mapValue] of Object.entries(map)) {
    if (key.includes(mapKey) && mapKey.length >= 4) {
      return { normalizedStatus: mapValue, mapped: true };
    }
  }

  const fallback = keywordFallback(rawStatus);
  if (fallback) {
    console.log(`[StatusNorm] Keyword fallback for "${rawStatus}" (${courier}) -> ${fallback}`);
    return { normalizedStatus: fallback, mapped: true };
  }

  console.warn(`[StatusNorm] UNMAPPED STATUS: "${rawStatus}" from ${courier} - keeping previous status`);
  if (currentStatus && UNIVERSAL_STATUSES.includes(currentStatus as UniversalStatus)) {
    return { normalizedStatus: currentStatus as UniversalStatus, mapped: false };
  }

  return { normalizedStatus: 'BOOKED', mapped: false };
}

export function detectCourierType(courierName: string): CourierType | null {
  const name = courierName.toLowerCase();
  if (name.includes('leopard')) return 'leopards';
  if (name.includes('postex')) return 'postex';
  return null;
}

export function isFinalStatus(status: string): boolean {
  return FINAL_STATUSES.includes(status as UniversalStatus);
}

export function getStatusDisplayLabel(status: string): string {
  const labels: Record<string, string> = {
    'BOOKED': 'Booked',
    'PICKED_UP': 'Picked Up',
    'ARRIVED_AT_ORIGIN': 'At Origin',
    'IN_TRANSIT': 'In Transit',
    'ARRIVED_AT_DESTINATION': 'At Destination',
    'OUT_FOR_DELIVERY': 'Out for Delivery',
    'DELIVERY_ATTEMPTED': 'Delivery Attempted',
    'DELIVERED': 'Delivered',
    'DELIVERY_FAILED': 'Delivery Failed',
    'READY_FOR_RETURN': 'Ready for Return',
    'RETURN_IN_TRANSIT': 'Return in Transit',
    'RETURNED_TO_SHIPPER': 'Returned',
    'CANCELLED': 'Cancelled',
  };
  return labels[status] || status;
}
