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
  'RETURNED_TO_ORIGIN',
  'RETURNED_TO_SHIPPER',
  'CANCELLED',
] as const;

export type UniversalStatus = typeof UNIVERSAL_STATUSES[number];

const FINAL_STATUSES: UniversalStatus[] = ['DELIVERED', 'RETURNED_TO_SHIPPER', 'CANCELLED'];

export const POSTEX_STATUS_MAP: Record<string, UniversalStatus> = {
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
  'returned to origin': 'RETURNED_TO_ORIGIN',
  'arrived at origin city': 'RETURNED_TO_ORIGIN',
  'return arrived at origin': 'RETURNED_TO_ORIGIN',
  'returned': 'RETURNED_TO_SHIPPER',
  'returned to shipper': 'RETURNED_TO_SHIPPER',
  'returned at merchant warehouse': 'RETURNED_TO_SHIPPER',
  'returned to merchant': 'RETURNED_TO_SHIPPER',
  'en route to merchant warehouse': 'RETURN_IN_TRANSIT',
  'cancelled': 'CANCELLED',
  'booking cancelled by merchant': 'CANCELLED',
  'booking cancelled by merchant ': 'CANCELLED',
  'order cancelled': 'CANCELLED',
};

export const LEOPARDS_STATUS_MAP: Record<string, UniversalStatus> = {
  'booking created': 'BOOKED',
  'booked': 'BOOKED',
  'shipment created': 'BOOKED',
  'pickup request not send': 'BOOKED',
  'pickup request not sent': 'BOOKED',
  'pickup request sent': 'BOOKED',
  'packet not found in system': 'BOOKED',
  'posted for consignment booking': 'BOOKED',
  'consignment booked': 'BOOKED',
  'picked up': 'PICKED_UP',
  'shipment picked': 'PICKED_UP',
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
  'pending': 'DELIVERY_ATTEMPTED',
  'ready for return': 'READY_FOR_RETURN',
  'waiting for return': 'READY_FOR_RETURN',
  'return process initiated': 'READY_FOR_RETURN',
  'being return': 'RETURN_IN_TRANSIT',
  'return in transit': 'RETURN_IN_TRANSIT',
  'return dispatched': 'RETURN_IN_TRANSIT',
  'being returned': 'RETURN_IN_TRANSIT',
  'return to sender': 'RETURN_IN_TRANSIT',
  'return to origin': 'RETURNED_TO_ORIGIN',
  'returned to origin': 'RETURNED_TO_ORIGIN',
  'return arrived at origin': 'RETURNED_TO_ORIGIN',
  'arrived at origin city': 'RETURNED_TO_ORIGIN',
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
  if (s.includes('return') && s.includes('origin')) return 'RETURNED_TO_ORIGIN';
  if (s.includes('return') && s.includes('transit')) return 'RETURN_IN_TRANSIT';
  if (s.includes('return') && (s.includes('ready') || s.includes('waiting') || s.includes('initiated') || s.includes('process'))) return 'READY_FOR_RETURN';
  if (s.includes('return') && (s.includes('being') || s.includes('dispatched'))) return 'RETURN_IN_TRANSIT';
  if (s.includes('return to ')) return 'RETURN_IN_TRANSIT';
  if (s.includes('cancel')) return 'CANCELLED';
  if (s.includes('arrived') && s.includes('destination')) return 'ARRIVED_AT_DESTINATION';
  if (s.includes('destination')) return 'ARRIVED_AT_DESTINATION';
  if (s.includes('arrived') || s.includes('at station') || s.includes('at hub')) return 'ARRIVED_AT_ORIGIN';
  if (s.includes('in transit') || s.includes('dispatched') || s.includes('on route') || s.includes('in-transit')) return 'IN_TRANSIT';
  if (s.includes('picked up') || s.includes('pickup done') || s.includes('assign') || s.includes('shipment picked')) return 'PICKED_UP';
  if (s.startsWith('pending')) return 'DELIVERY_ATTEMPTED';
  if (s.includes('booked') || s.includes('booking') || s.includes('created')) return 'BOOKED';

  return null;
}

export type CourierType = 'leopards' | 'postex';

function getCourierMap(courier: CourierType): Record<string, UniversalStatus> {
  return courier === 'leopards' ? LEOPARDS_STATUS_MAP : POSTEX_STATUS_MAP;
}

const AMBIGUOUS_ORIGIN_STATUSES = ['arrived at station', 'at station', 'arrived at origin', 'at origin facility'];
const POST_ORIGIN_STATUSES: UniversalStatus[] = ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION', 'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED', 'DELIVERY_FAILED', 'READY_FOR_RETURN', 'RETURN_IN_TRANSIT', 'RETURNED_TO_ORIGIN'];
const POST_BOOKING_WORKFLOWS = ['FULFILLED', 'DELIVERED', 'RETURN'];
const TRANSIT_INDICATORS = ['in transit', 'dispatched', 'dispatched to destination', 'in transit to destination', 'shipment in transit', 'package on route', 'out for delivery', 'delivery attempted', 'attempt failed', 'delivery attempt', 'enroute for delivery', 'arrived at destination', 'at destination'];

function hasPassedThroughTransit(currentStatus?: string | null, workflowStatus?: string | null, events?: Array<{ status: string; date?: string; description?: string }>): boolean {
  if (currentStatus && POST_ORIGIN_STATUSES.includes(currentStatus as UniversalStatus)) {
    return true;
  }
  if (workflowStatus && POST_BOOKING_WORKFLOWS.includes(workflowStatus)) {
    return true;
  }
  if (!events || events.length === 0) return false;
  return events.some(e => {
    const s = (e.status || '').toLowerCase().trim();
    return TRANSIT_INDICATORS.some(t => s.includes(t));
  });
}

export interface KeywordMappingRule {
  keyword: string;
  normalizedStatus: string;
  courierName?: string | null;
  priority?: number | null;
}

export function normalizeStatus(
  rawStatus: string,
  courier: CourierType,
  currentStatus?: string | null,
  events?: Array<{ status: string; date?: string; description?: string }>,
  workflowStatus?: string | null,
  customMappings?: Record<string, string>,
  keywordMappings?: KeywordMappingRule[],
): { normalizedStatus: UniversalStatus; mapped: boolean } {
  if (currentStatus && FINAL_STATUSES.includes(currentStatus as UniversalStatus)) {
    return { normalizedStatus: currentStatus as UniversalStatus, mapped: true };
  }

  const key = rawStatus.toLowerCase().trim();

  if (customMappings && customMappings[key]) {
    const customResult = customMappings[key] as UniversalStatus;
    if (UNIVERSAL_STATUSES.includes(customResult)) {
      return { normalizedStatus: customResult, mapped: true };
    }
  }

  if (keywordMappings && keywordMappings.length > 0) {
    const sorted = [...keywordMappings].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const rule of sorted) {
      const matchesCourier = !rule.courierName || rule.courierName.toLowerCase() === courier.toLowerCase();
      if (matchesCourier && key.includes(rule.keyword.toLowerCase())) {
        const mapped = rule.normalizedStatus as UniversalStatus;
        if (UNIVERSAL_STATUSES.includes(mapped)) {
          return { normalizedStatus: mapped, mapped: true };
        }
      }
    }
  }

  const map = getCourierMap(courier);

  const applyRegressionGuard = (newStatus: UniversalStatus): UniversalStatus => {
    if (newStatus === 'BOOKED' && currentStatus && currentStatus !== 'BOOKED' && POST_ORIGIN_STATUSES.includes(currentStatus as UniversalStatus)) {
      return currentStatus as UniversalStatus;
    }
    if (newStatus === 'BOOKED' && workflowStatus && POST_BOOKING_WORKFLOWS.includes(workflowStatus)) {
      return (currentStatus as UniversalStatus) || 'PICKED_UP';
    }
    return newStatus;
  };

  if (key === 'pending' && courier === 'leopards') {
    if (!events || events.length === 0) {
      return { normalizedStatus: 'BOOKED', mapped: true };
    }
    if (hasPassedThroughTransit(currentStatus, workflowStatus, events)) {
      return { normalizedStatus: 'DELIVERY_ATTEMPTED', mapped: true };
    }
    return { normalizedStatus: 'BOOKED', mapped: true };
  }

  const directMatch = map[key];
  if (directMatch) {
    if (directMatch === 'ARRIVED_AT_ORIGIN' && AMBIGUOUS_ORIGIN_STATUSES.includes(key)) {
      if (hasPassedThroughTransit(currentStatus, workflowStatus, events)) {
        return { normalizedStatus: 'ARRIVED_AT_DESTINATION', mapped: true };
      }
    }
    const guarded = applyRegressionGuard(directMatch);
    return { normalizedStatus: guarded, mapped: true };
  }

  for (const [mapKey, mapValue] of Object.entries(map)) {
    if (key.includes(mapKey) && mapKey.length >= 4) {
      if (mapValue === 'ARRIVED_AT_ORIGIN' && AMBIGUOUS_ORIGIN_STATUSES.some(a => key.includes(a))) {
        if (hasPassedThroughTransit(currentStatus, workflowStatus, events)) {
          return { normalizedStatus: 'ARRIVED_AT_DESTINATION', mapped: true };
        }
      }
      const guarded = applyRegressionGuard(mapValue);
      return { normalizedStatus: guarded, mapped: true };
    }
  }

  const fallback = keywordFallback(rawStatus);
  if (fallback) {
    if (fallback === 'ARRIVED_AT_ORIGIN' && hasPassedThroughTransit(currentStatus, workflowStatus, events)) {
      console.log(`[StatusNorm] Keyword fallback for "${rawStatus}" (${courier}) -> ARRIVED_AT_DESTINATION (post-transit)`);
      return { normalizedStatus: 'ARRIVED_AT_DESTINATION', mapped: false };
    }
    const guarded = applyRegressionGuard(fallback);
    console.log(`[StatusNorm] Keyword fallback for "${rawStatus}" (${courier}) -> ${guarded}`);
    return { normalizedStatus: guarded, mapped: false };
  }

  console.warn(`[StatusNorm] UNMAPPED STATUS: "${rawStatus}" from ${courier} - keeping previous status`);
  if (currentStatus && UNIVERSAL_STATUSES.includes(currentStatus as UniversalStatus)) {
    return { normalizedStatus: currentStatus as UniversalStatus, mapped: false };
  }

  if (!currentStatus) {
    return { normalizedStatus: 'BOOKED', mapped: false };
  }

  return { normalizedStatus: (currentStatus as UniversalStatus) || 'BOOKED', mapped: false };
}

export const DEFAULT_WORKFLOW_STAGE_MAP: Record<string, string> = {
  'BOOKED': 'BOOKED',
  'PICKED_UP': 'FULFILLED',
  'ARRIVED_AT_ORIGIN': 'FULFILLED',
  'IN_TRANSIT': 'FULFILLED',
  'ARRIVED_AT_DESTINATION': 'FULFILLED',
  'OUT_FOR_DELIVERY': 'FULFILLED',
  'DELIVERY_ATTEMPTED': 'FULFILLED',
  'DELIVERED': 'DELIVERED',
  'DELIVERY_FAILED': 'FULFILLED',
  'READY_FOR_RETURN': 'FULFILLED',
  'RETURN_IN_TRANSIT': 'RETURN',
  'RETURNED_TO_ORIGIN': 'RETURN',
  'RETURNED_TO_SHIPPER': 'RETURN',
  'CANCELLED': 'CANCELLED',
};

export function detectCourierType(courierName: string): CourierType | null {
  const name = courierName.toLowerCase();
  if (name.includes('leopard')) return 'leopards';
  if (name.includes('postex')) return 'postex';
  return null;
}

export function isFinalStatus(status: string): boolean {
  return FINAL_STATUSES.includes(status as UniversalStatus);
}

export function isValidUniversalStatus(status: string): boolean {
  return UNIVERSAL_STATUSES.includes(status as UniversalStatus);
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
    'RETURNED_TO_ORIGIN': 'Returned to Origin',
    'RETURNED_TO_SHIPPER': 'Returned',
    'CANCELLED': 'Cancelled',
  };
  return labels[status] || status;
}
