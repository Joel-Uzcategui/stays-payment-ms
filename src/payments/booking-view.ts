export interface BookingView {
  bookingId: string;
  status: string;
  roomTypeId: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  units: number;
  totalCents: number;
  currency: string;
  expiresAt: string | null;
}
