export type CourierType = 'leopards' | 'postex';

export const WORKFLOW_STAGES = ['BOOKED', 'FULFILLED', 'DELIVERED', 'RETURN', 'CANCELLED'] as const;
export type WorkflowStage = typeof WORKFLOW_STAGES[number];

export interface CourierStatusSeed {
  courier: CourierType;
  stage: WorkflowStage;
}

export const COURIER_STATUS_SEED: Record<string, CourierStatusSeed> = {
  'unbooked': { courier: 'postex', stage: 'BOOKED' },
  'booked': { courier: 'postex', stage: 'BOOKED' },
  'pickup request not send': { courier: 'postex', stage: 'BOOKED' },
  'pickup request not sent': { courier: 'postex', stage: 'BOOKED' },
  'pickup request sent': { courier: 'postex', stage: 'BOOKED' },
  'packet not found in system': { courier: 'postex', stage: 'BOOKED' },
  'posted for consignment booking': { courier: 'postex', stage: 'BOOKED' },
  'rc': { courier: 'postex', stage: 'BOOKED' },

  'consignment booked': { courier: 'leopards', stage: 'BOOKED' },
  'booking created': { courier: 'leopards', stage: 'BOOKED' },
  'shipment created': { courier: 'leopards', stage: 'BOOKED' },

  'pending': { courier: 'postex', stage: 'FULFILLED' },
  'at merchant\'s warehouse': { courier: 'postex', stage: 'FULFILLED' },
  'picked up': { courier: 'postex', stage: 'FULFILLED' },
  'shipment picked': { courier: 'leopards', stage: 'FULFILLED' },
  'assign to courier': { courier: 'postex', stage: 'FULFILLED' },
  'assigned to courier': { courier: 'leopards', stage: 'FULFILLED' },
  'pickup done': { courier: 'postex', stage: 'FULFILLED' },
  'at postex warehouse': { courier: 'postex', stage: 'FULFILLED' },
  'arrived at postex warehouse': { courier: 'postex', stage: 'FULFILLED' },
  'at origin facility': { courier: 'postex', stage: 'FULFILLED' },
  'arrived at station': { courier: 'leopards', stage: 'FULFILLED' },
  'arrived at origin': { courier: 'leopards', stage: 'FULFILLED' },
  'at station': { courier: 'leopards', stage: 'FULFILLED' },
  'package on route': { courier: 'postex', stage: 'FULFILLED' },
  'in transit': { courier: 'postex', stage: 'FULFILLED' },
  'dispatched': { courier: 'leopards', stage: 'FULFILLED' },
  'in transit to destination': { courier: 'postex', stage: 'FULFILLED' },
  'shipment in transit': { courier: 'leopards', stage: 'FULFILLED' },
  'dispatched to destination': { courier: 'leopards', stage: 'FULFILLED' },
  'arrived at destination hub': { courier: 'leopards', stage: 'FULFILLED' },
  'arrived at destination': { courier: 'leopards', stage: 'FULFILLED' },
  'at destination hub': { courier: 'leopards', stage: 'FULFILLED' },
  'at destination': { courier: 'leopards', stage: 'FULFILLED' },
  'arrived at destination station': { courier: 'leopards', stage: 'FULFILLED' },
  'out for delivery': { courier: 'postex', stage: 'FULFILLED' },
  'enroute for delivery': { courier: 'leopards', stage: 'FULFILLED' },
  'attempt made': { courier: 'postex', stage: 'FULFILLED' },
  'delivery attempt': { courier: 'postex', stage: 'FULFILLED' },
  'delivery attempted': { courier: 'leopards', stage: 'FULFILLED' },
  'attempt failed': { courier: 'postex', stage: 'FULFILLED' },
  'delivery under review': { courier: 'postex', stage: 'FULFILLED' },
  'delivery failed': { courier: 'postex', stage: 'FULFILLED' },
  'refused': { courier: 'postex', stage: 'FULFILLED' },
  'not accepted': { courier: 'postex', stage: 'FULFILLED' },
  'undelivered': { courier: 'postex', stage: 'FULFILLED' },
  'failed': { courier: 'postex', stage: 'FULFILLED' },
  'not delivered': { courier: 'postex', stage: 'FULFILLED' },
  'sp': { courier: 'leopards', stage: 'FULFILLED' },
  'ac': { courier: 'leopards', stage: 'FULFILLED' },
  'dp': { courier: 'leopards', stage: 'FULFILLED' },
  'ar': { courier: 'leopards', stage: 'FULFILLED' },
  'pn1': { courier: 'leopards', stage: 'FULFILLED' },
  'pn2': { courier: 'leopards', stage: 'FULFILLED' },

  'delivered': { courier: 'postex', stage: 'DELIVERED' },
  'delivered to customer': { courier: 'leopards', stage: 'DELIVERED' },
  'dv': { courier: 'leopards', stage: 'DELIVERED' },
  'dr': { courier: 'leopards', stage: 'DELIVERED' },

  'ready for return': { courier: 'postex', stage: 'RETURN' },
  'waiting for return': { courier: 'postex', stage: 'RETURN' },
  'return process initiated': { courier: 'postex', stage: 'RETURN' },
  'return in transit': { courier: 'postex', stage: 'RETURN' },
  'being return': { courier: 'postex', stage: 'RETURN' },
  'being returned': { courier: 'postex', stage: 'RETURN' },
  'return dispatched': { courier: 'postex', stage: 'RETURN' },
  'return to sender': { courier: 'postex', stage: 'RETURN' },
  'return to origin': { courier: 'leopards', stage: 'RETURN' },
  'returned to origin': { courier: 'leopards', stage: 'RETURN' },
  'arrived at origin city': { courier: 'leopards', stage: 'RETURN' },
  'return arrived at origin': { courier: 'leopards', stage: 'RETURN' },
  'returned': { courier: 'postex', stage: 'RETURN' },
  'returned to shipper': { courier: 'leopards', stage: 'RETURN' },
  'returned at merchant warehouse': { courier: 'postex', stage: 'RETURN' },
  'returned to merchant': { courier: 'postex', stage: 'RETURN' },
  'en route to merchant warehouse': { courier: 'postex', stage: 'RETURN' },
  'return completed': { courier: 'postex', stage: 'RETURN' },
  'nr': { courier: 'leopards', stage: 'RETURN' },
  'ro': { courier: 'leopards', stage: 'RETURN' },
  'rn1': { courier: 'leopards', stage: 'RETURN' },
  'rn2': { courier: 'leopards', stage: 'RETURN' },
  'rw': { courier: 'leopards', stage: 'RETURN' },
  'dw': { courier: 'leopards', stage: 'RETURN' },
  'rs': { courier: 'leopards', stage: 'RETURN' },

  'cancelled': { courier: 'postex', stage: 'CANCELLED' },
  'booking cancelled by merchant': { courier: 'postex', stage: 'CANCELLED' },
  'booking cancelled by merchant ': { courier: 'postex', stage: 'CANCELLED' },
  'order cancelled': { courier: 'postex', stage: 'CANCELLED' },
  'shipment cancelled': { courier: 'leopards', stage: 'CANCELLED' },
};

export const SHARED_STATUSES: string[] = [
  'delivered',
  'cancelled',
  'in transit',
  'out for delivery',
  'picked up',
  'attempt failed',
  'delivery failed',
  'refused',
  'returned',
  'assigned to courier',
];

export const DEFAULT_RAW_TO_STAGE: Record<string, WorkflowStage> = Object.fromEntries(
  Object.entries(COURIER_STATUS_SEED).map(([status, { stage }]) => [status, stage])
);

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

export function detectCourierFromStatus(rawStatus: string): CourierType {
  const key = rawStatus.toLowerCase().trim();
  const seed = COURIER_STATUS_SEED[key];
  if (seed) return seed.courier;
  if (key.includes('postex') || key.includes('post ex')) return 'postex';
  return 'leopards';
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
