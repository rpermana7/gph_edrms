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

export interface Anomaly {
  id: string;
  guestName: string;
  arrival: string;
  type: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  category: 'Ecommerce' | 'Distribution' | 'Revenue' | 'Data Entry';
  createdBy: string;
}

export interface AuditReport {
  id: string;
  created_at: string;
  insights: AiInsight[];
  ota_leakage: OtaLeakageData;
  total_reservations: number;
}

export interface AuditScan {
  id: string;
  created_at: string;
  anomalies: Anomaly[];
  total_records: number;
}
