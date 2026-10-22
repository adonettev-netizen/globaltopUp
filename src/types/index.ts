export interface Country {
  id: string;
  ding_country_code: string;
  name: string;
  iso_code: string | null;
  calling_code: string | null;
  flag: string | null;
  is_supported: boolean;
}

export interface Operator {
  id: string;
  ding_operator_code: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
}

export interface RechargeProduct {
  id: string;
  ding_product_code: string;
  product_name: string;
  local_amount: number;
  local_currency: string;
  wholesale_cost: number | null;
  is_active: boolean;
  operator: Operator;
}

export interface PricingQuote {
  requested_amount_brl: number;
  destination_currency: string;
  exchange_rate_brl_to_dest: number;
  exchange_rate_timestamp: string;
  estimated_destination_amount: number;
  matched_product: RechargeProduct & {
    is_exact_match: boolean;
    is_within_tolerance: boolean;
    difference_from_requested: number;
  };
  customer_price_brl: number;
  pricing_breakdown: {
    provider_cost: number;
    profit_margin_percent: number;
    profit_amount: number;
    exchange_rate: number;
  };
  alternatives: (RechargeProduct & { estimated_brl_cost: number })[];
  minimum_brl: number;
  maximum_brl: number;
}

export interface LookupResult {
  detected: boolean;
  message?: string;
  country?: {
    id: string;
    name: string;
    iso_code: string;
    calling_code: string;
    flag: string;
  };
  national_number?: string;
  full_number?: string;
  operators?: Operator[];
  detected_operator?: Operator | null;
  auto_detected?: boolean;
  operator_detection_method?: 'none' | 'estimate' | 'confirmed';
  lookup_error?: string | null;
  needs_more_digits?: boolean;
}

export interface Order {
  id: string;
  order_reference: string;
  recipient_phone: string;
  customer_amount: number;
  customer_currency: string;
  payment_provider: 'stripe' | 'mercado_pago';
  payment_status: string;
  recharge_status: string;
  provider_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  country?: { name: string; iso_code: string; calling_code: string; flag: string };
  operator?: { name: string; logo_url: string | null };
  product?: { product_name: string; local_amount: number; local_currency: string };
  payments?: Payment[];
}

export interface Payment {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface CreateOrderResponse {
  success: boolean;
  order: {
    id: string;
    order_reference: string;
    access_token: string;
    recipient_phone: string;
    customer_amount: number;
    customer_currency: string;
    payment_provider: 'stripe' | 'mercado_pago';
    payment_status: string;
    recharge_status: string;
  };
  checkout_url: string | null;
  checkout_error: string | null;
  product: {
    id: string;
    product_name: string;
    local_amount: number;
    local_currency: string;
  };
  operator: {
    id: string;
    name: string;
  };
  country: {
    name: string;
    iso_code: string;
    calling_code: string;
    flag: string;
  };
  pricing: {
    base_amount_brl: number;
    exchange_rate: number;
    exchange_rate_timestamp: string;
    destination_amount: number;
    destination_currency: string;
  };
}
