export interface ReservationReport {
  No: number;
  CreatedDate: string;
  ReservationNumber: number;
  ReservationName: string;
  Arrival: string;
  Departure: string;
  RoomNumber: string;
  RoomQuantity: number;
  Night: number;
  RoomType: string;
  Nationality: string;
  Adult: number;
  Compliment: number;
  Arrangement: string;
  RateCode: string;
  RoomRate: number;
  TotalRevenue: number;
  GuestName: string;
  Segment: string;
  VoucherNo: string;
  SOB: string;
  Status: string;
  CreatedBy: string;
  CreatedId: number;
}

export interface DashboardStats {
  totalRevenue: number;
  totalRooms: number;
  totalNights: number;
  adr: number;
  occupancyRate: number;
  revPar: number;
}
