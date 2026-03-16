export type CourierType = 'leopards' | 'postex';

export const WORKFLOW_STAGES = ['BOOKED', 'FULFILLED', 'DELIVERED', 'RETURN', 'CANCELLED'] as const;
export type WorkflowStage = typeof WORKFLOW_STAGES[number];

export const DEFAULT_RAW_TO_STAGE: Record<string, WorkflowStage> = {
  'unbooked': 'BOOKED',
  'booked': 'BOOKED',
  'consignment booked': 'BOOKED',
  'booking created': 'BOOKED',
  'shipment created': 'BOOKED',
  'pickup request not send': 'BOOKED',
  'pickup request not sent': 'BOOKED',
  'pickup request sent': 'BOOKED',
  'packet not found in system': 'BOOKED',
  'posted for consignment booking': 'BOOKED',
  'rc': 'BOOKED',

  'pending': 'FULFILLED',
  'at merchant\'s warehouse': 'FULFILLED',
  'picked up': 'FULFILLED',
  'shipment picked': 'FULFILLED',
  'assign to courier': 'FULFILLED',
  'assigned to courier': 'FULFILLED',
  'pickup done': 'FULFILLED',
  'at postex warehouse': 'FULFILLED',
  'arrived at postex warehouse': 'FULFILLED',
  'at origin facility': 'FULFILLED',
  'arrived at station': 'FULFILLED',
  'arrived at origin': 'FULFILLED',
  'at station': 'FULFILLED',
  'package on route': 'FULFILLED',
  'in transit': 'FULFILLED',
  'dispatched': 'FULFILLED',
  'in transit to destination': 'FULFILLED',
  'shipment in transit': 'FULFILLED',
  'dispatched to destination': 'FULFILLED',
  'arrived at destination hub': 'FULFILLED',
  'arrived at destination': 'FULFILLED',
  'at destination hub': 'FULFILLED',
  'at destination': 'FULFILLED',
  'arrived at destination station': 'FULFILLED',
  'out for delivery': 'FULFILLED',
  'enroute for delivery': 'FULFILLED',
  'attempt made': 'FULFILLED',
  'delivery attempt': 'FULFILLED',
  'delivery attempted': 'FULFILLED',
  'attempt failed': 'FULFILLED',
  'delivery under review': 'FULFILLED',
  'delivery failed': 'FULFILLED',
  'refused': 'FULFILLED',
  'not accepted': 'FULFILLED',
  'undelivered': 'FULFILLED',
  'failed': 'FULFILLED',
  'not delivered': 'FULFILLED',
  'sp': 'FULFILLED',
  'ac': 'FULFILLED',
  'dp': 'FULFILLED',
  'ar': 'FULFILLED',
  'pn1': 'FULFILLED',
  'pn2': 'FULFILLED',

  'delivered': 'DELIVERED',
  'delivered to customer': 'DELIVERED',
  'dv': 'DELIVERED',
  'dr': 'DELIVERED',

  'ready for return': 'RETURN',
  'waiting for return': 'RETURN',
  'return process initiated': 'RETURN',
  'return in transit': 'RETURN',
  'being return': 'RETURN',
  'being returned': 'RETURN',
  'return dispatched': 'RETURN',
  'return to sender': 'RETURN',
  'return to origin': 'RETURN',
  'returned to origin': 'RETURN',
  'arrived at origin city': 'RETURN',
  'return arrived at origin': 'RETURN',
  'returned': 'RETURN',
  'returned to shipper': 'RETURN',
  'returned at merchant warehouse': 'RETURN',
  'returned to merchant': 'RETURN',
  'en route to merchant warehouse': 'RETURN',
  'return completed': 'RETURN',
  'nr': 'RETURN',
  'ro': 'RETURN',
  'rn1': 'RETURN',
  'rn2': 'RETURN',
  'rw': 'RETURN',
  'dw': 'RETURN',
  'rs': 'RETURN',

  'cancelled': 'CANCELLED',
  'booking cancelled by merchant': 'CANCELLED',
  'booking cancelled by merchant ': 'CANCELLED',
  'order cancelled': 'CANCELLED',
  'shipment cancelled': 'CANCELLED',
};

export function resolveWorkflowStage(
  rawStatus: string,
  customStageMappings?: Record<string, string>,
): WorkflowStage | null {
  const key = rawStatus.toLowerCase().trim();

  if (customStageMappings && customStageMappings[key]) {
    const stage = customStageMappings[key] as WorkflowStage;
    if (WORKFLOW_STAGES.includes(stage)) {
      return stage;
    }
  }

  const defaultStage = DEFAULT_RAW_TO_STAGE[key];
  if (defaultStage) return defaultStage;

  const s = key;
  if (s.includes('delivered') && !s.includes('un') && !s.includes('not') && !s.includes('fail') && !s.includes('attempt')) return 'DELIVERED';
  if (s.includes('deliver') && (s.includes('success') || s.includes('completed'))) return 'DELIVERED';
  if (s.includes('return') && (s.includes('shipper') || s.includes('merchant') || s.includes('completed'))) return 'RETURN';
  if (s.includes('return')) return 'RETURN';
  if (s.includes('cancel')) return 'CANCELLED';
  if (s.includes('out') && s.includes('delivery')) return 'FULFILLED';
  if (s.includes('attempt')) return 'FULFILLED';
  if (s.includes('refused') || s.includes('not accepted')) return 'FULFILLED';
  if (s.includes('in transit') || s.includes('dispatched') || s.includes('on route') || s.includes('in-transit')) return 'FULFILLED';
  if (s.includes('arrived') || s.includes('at station') || s.includes('at hub') || s.includes('destination')) return 'FULFILLED';
  if (s.includes('picked up') || s.includes('pickup done') || s.includes('assign') || s.includes('shipment picked')) return 'FULFILLED';
  if (s.includes('booked') || s.includes('booking') || s.includes('created')) return 'BOOKED';

  return null;
}

export function detectCourierType(courierName: string): CourierType | null {
  const name = courierName.toLowerCase();
  if (name.includes('leopard')) return 'leopards';
  if (name.includes('postex')) return 'postex';
  return null;
}

export function isFinalStatus(rawStatus: string): boolean {
  const stage = resolveWorkflowStage(rawStatus);
  return stage === 'DELIVERED' || stage === 'RETURN' || stage === 'CANCELLED';
}

export function truncateStatus(status: string, wordCount: number = 3): string {
  const words = status.split(/\s+/);
  if (words.length <= wordCount) return status;
  return words.slice(0, wordCount).join(' ') + '...';
}
