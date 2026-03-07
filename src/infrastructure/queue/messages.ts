export interface ProcessEventMessage {
  normalizedEventId: string;
  attemptNo: number;
  triggeredBy: 'webhook' | 'retry' | 'replay';
  replayRequestId?: string;
  correlationId: string;
}

export interface ReplayEventMessage {
  normalizedEventId: string;
  replayRequestId: string;
  requestedBy: string;
  correlationId: string;
}
