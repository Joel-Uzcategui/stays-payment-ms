export interface RefundRequestedEvent {
  paymentId?: string;
  bookingId: string;
  userId: string;
  reason: string;
}
