export interface AiInsight {
  category: 'Ecommerce' | 'Distribution' | 'Revenue' | 'Seasonality';
  title: string;
  analysis: string;
  advice: string[];
}

export interface OtaLeakageData {
  revenue: number;
  otaFee: number;
  directFee: number;
  leakage: number;
  count: number;
}

export interface AuditReport {
  id: string;
  created_at: string;
  insights: AiInsight[];
  ota_leakage: OtaLeakageData;
  total_reservations: number;
}
