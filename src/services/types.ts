export interface PaymentResult {
  method: "dinheiro" | "debito" | "credito" | "pix" | "voucher" | "prazo" | "outros";
  approved: boolean;
  amount: number;
  nsu?: string;
  auth_code?: string;
  card_brand?: string;
  card_last_digits?: string;
  installments?: number;
  change_amount?: number;
  pix_tx_id?: string;
  credit_client_id?: string;
  credit_client_name?: string;
  credit_mode?: "fiado" | "parcelado";
  credit_installments?: number;
}
