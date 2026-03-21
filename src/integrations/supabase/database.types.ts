export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      action_logs: {
        Row: {
          id: string
          company_id: string
          user_id: string
          user_name: string | null
          action: string
          module: string
          details: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          user_name?: string | null
          action: string
          module: string
          details?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          user_id?: string
          user_name?: string | null
          action?: string
          module?: string
          details?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      action_logs_archive: {
        Row: {
          id: string
          company_id: string
          user_id: string | null
          action: string
          module: string | null
          details: string | null
          user_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id?: string | null
          action: string
          module?: string | null
          details?: string | null
          user_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          user_id?: string | null
          action?: string
          module?: string | null
          details?: string | null
          user_name?: string | null
          created_at?: string
        }
      }
      admin_notifications: {
        Row: {
          id: string
          company_id: string | null
          title: string
          message: string
          type: string
          created_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          company_id?: string | null
          title: string
          message: string
          type: string
          created_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          company_id?: string | null
          title?: string
          message?: string
          type?: string
          created_at?: string | null
          created_by?: string | null
        }
      }
      admin_roles: {
        Row: {
          id: string
          user_id: string
          role: string
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          role: string
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          role?: string
          created_at?: string | null
        }
      }
      assemblies: {
        Row: {
          id: string
          company_id: string
          client_name: string
          address: string
          phone: string | null
          assembler: string | null
          helper: string | null
          scheduled_date: string
          scheduled_time: string | null
          items: string | null
          notes: string | null
          status: string
          photos: string[] | null
          created_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          company_id: string
          client_name: string
          address: string
          phone?: string | null
          assembler?: string | null
          helper?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          items?: string | null
          notes?: string | null
          status: string
          photos?: string[] | null
          created_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          client_name?: string
          address?: string
          phone?: string | null
          assembler?: string | null
          helper?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          items?: string | null
          notes?: string | null
          status?: string
          photos?: string[] | null
          created_at?: string | null
          created_by?: string | null
        }
      }
      backup_history: {
        Row: {
          id: string
          company_id: string
          file_path: string
          file_size: number | null
          tables_included: string[]
          records_count: Json | null
          created_by: string
          created_at: string
          expires_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          file_path: string
          file_size?: number | null
          tables_included: string[]
          records_count?: Json | null
          created_by: string
          created_at?: string
          expires_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          file_path?: string
          file_size?: number | null
          tables_included?: string[]
          records_count?: Json | null
          created_by?: string
          created_at?: string
          expires_at?: string | null
        }
      }
      bank_transactions: {
        Row: {
          id: string
          company_id: string
          transaction_date: string
          description: string
          amount: number
          type: string
          bank_name: string | null
          account_number: string | null
          reconciled: boolean
          financial_entry_id: string | null
          imported_at: string
          imported_by: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          transaction_date: string
          description: string
          amount: number
          type: string
          bank_name?: string | null
          account_number?: string | null
          reconciled?: boolean
          financial_entry_id?: string | null
          imported_at?: string
          imported_by: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          transaction_date?: string
          description?: string
          amount?: number
          type?: string
          bank_name?: string | null
          account_number?: string | null
          reconciled?: boolean
          financial_entry_id?: string | null
          imported_at?: string
          imported_by?: string
          notes?: string | null
          created_at?: string
        }
      }
      card_administrators: {
        Row: {
          id: string
          company_id: string
          name: string
          cnpj: string | null
          debit_rate: number
          credit_rate: number
          credit_installment_rate: number
          debit_settlement_days: number
          credit_settlement_days: number
          antecipation_rate: number | null
          contact_phone: string | null
          contact_email: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          cnpj?: string | null
          debit_rate?: number
          credit_rate?: number
          credit_installment_rate?: number
          debit_settlement_days?: number
          credit_settlement_days?: number
          antecipation_rate?: number | null
          contact_phone?: string | null
          contact_email?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          cnpj?: string | null
          debit_rate?: number
          credit_rate?: number
          credit_installment_rate?: number
          debit_settlement_days?: number
          credit_settlement_days?: number
          antecipation_rate?: number | null
          contact_phone?: string | null
          contact_email?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      carriers: {
        Row: {
          id: string
          company_id: string
          name: string
          trade_name: string | null
          cnpj: string | null
          ie: string | null
          email: string | null
          phone: string | null
          address_street: string | null
          address_city: string | null
          address_state: string | null
          address_zip: string | null
          antt_code: string | null
          vehicle_plate: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          trade_name?: string | null
          cnpj?: string | null
          ie?: string | null
          email?: string | null
          phone?: string | null
          address_street?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zip?: string | null
          antt_code?: string | null
          vehicle_plate?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          trade_name?: string | null
          cnpj?: string | null
          ie?: string | null
          email?: string | null
          phone?: string | null
          address_street?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zip?: string | null
          antt_code?: string | null
          vehicle_plate?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      cash_movements: {
        Row: {
          id: string
          session_id: string
          company_id: string
          type: string
          amount: number
          payment_method: string | null
          description: string | null
          performed_by: string
          sale_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          company_id: string
          type: string
          amount: number
          payment_method?: string | null
          description?: string | null
          performed_by: string
          sale_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          company_id?: string
          type?: string
          amount?: number
          payment_method?: string | null
          description?: string | null
          performed_by?: string
          sale_id?: string | null
          created_at?: string
        }
      }
      cash_sessions: {
        Row: {
          id: string
          company_id: string
          terminal_id: string
          status: string
          opening_balance: number
          closing_balance: number | null
          opened_by: string
          closed_by: string | null
          opened_at: string
          closed_at: string | null
          total_dinheiro: number | null
          total_debito: number | null
          total_credito: number | null
          total_pix: number | null
          total_voucher: number | null
          total_outros: number | null
          total_sangria: number | null
          total_suprimento: number | null
          total_vendas: number | null
          sales_count: number | null
          counted_dinheiro: number | null
          counted_debito: number | null
          counted_credito: number | null
          counted_pix: number | null
          difference: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          terminal_id: string
          status: string
          opening_balance?: number
          closing_balance?: number | null
          opened_by: string
          closed_by?: string | null
          opened_at?: string
          closed_at?: string | null
          total_dinheiro?: number | null
          total_debito?: number | null
          total_credito?: number | null
          total_pix?: number | null
          total_voucher?: number | null
          total_outros?: number | null
          total_sangria?: number | null
          total_suprimento?: number | null
          total_vendas?: number | null
          sales_count?: number | null
          counted_dinheiro?: number | null
          counted_debito?: number | null
          counted_credito?: number | null
          counted_pix?: number | null
          difference?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          terminal_id?: string
          status?: string
          opening_balance?: number
          closing_balance?: number | null
          opened_by?: string
          closed_by?: string | null
          opened_at?: string
          closed_at?: string | null
          total_dinheiro?: number | null
          total_debito?: number | null
          total_credito?: number | null
          total_pix?: number | null
          total_voucher?: number | null
          total_outros?: number | null
          total_sangria?: number | null
          total_suprimento?: number | null
          total_vendas?: number | null
          sales_count?: number | null
          counted_dinheiro?: number | null
          counted_debito?: number | null
          counted_credito?: number | null
          counted_pix?: number | null
          difference?: number | null
          notes?: string | null
          created_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          company_id: string
          name: string
          trade_name: string | null
          cpf_cnpj: string | null
          ie: string | null
          email: string | null
          phone: string | null
          phone2: string | null
          address_street: string | null
          address_number: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_city: string | null
          address_state: string | null
          address_zip: string | null
          address_ibge_code: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          credit_limit: number | null
          credit_balance: number | null
          tipo_pessoa: string
          loyalty_points: number
          is_demo: boolean | null
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          trade_name?: string | null
          cpf_cnpj?: string | null
          ie?: string | null
          email?: string | null
          phone?: string | null
          phone2?: string | null
          address_street?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zip?: string | null
          address_ibge_code?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          credit_limit?: number | null
          credit_balance?: number | null
          tipo_pessoa?: string
          loyalty_points?: number
          is_demo?: boolean | null
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          trade_name?: string | null
          cpf_cnpj?: string | null
          ie?: string | null
          email?: string | null
          phone?: string | null
          phone2?: string | null
          address_street?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zip?: string | null
          address_ibge_code?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          credit_limit?: number | null
          credit_balance?: number | null
          tipo_pessoa?: string
          loyalty_points?: number
          is_demo?: boolean | null
        }
      }
      companies: {
        Row: {
          id: string
          name: string
          trade_name: string | null
          cnpj: string | null
          ie: string | null
          im: string | null
          email: string | null
          phone: string | null
          address_street: string | null
          address_number: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_city: string | null
          address_state: string | null
          address_zip: string | null
          address_ibge_code: string | null
          logo_url: string | null
          slogan: string | null
          tax_regime: string | null
          modo_seguro_fiscal: boolean
          is_blocked: boolean
          block_reason: string | null
          pix_key: string | null
          pix_key_type: string | null
          pix_city: string | null
          whatsapp_support: string | null
          accountant_name: string | null
          accountant_email: string | null
          accountant_phone: string | null
          accountant_crc: string | null
          accountant_auto_send: boolean | null
          accountant_send_day: number | null
          created_at: string
          updated_at: string
          parent_company_id: string | null
          crt: number | null
          segment: string | null
        }
        Insert: {
          id?: string
          name: string
          trade_name?: string | null
          cnpj?: string | null
          ie?: string | null
          im?: string | null
          email?: string | null
          phone?: string | null
          address_street?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zip?: string | null
          address_ibge_code?: string | null
          logo_url?: string | null
          slogan?: string | null
          tax_regime?: string | null
          modo_seguro_fiscal?: boolean
          is_blocked?: boolean
          block_reason?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          pix_city?: string | null
          whatsapp_support?: string | null
          accountant_name?: string | null
          accountant_email?: string | null
          accountant_phone?: string | null
          accountant_crc?: string | null
          accountant_auto_send?: boolean | null
          accountant_send_day?: number | null
          created_at?: string
          updated_at?: string
          parent_company_id?: string | null
          crt?: number | null
          segment?: string | null
        }
        Update: {
          id?: string
          name?: string
          trade_name?: string | null
          cnpj?: string | null
          ie?: string | null
          im?: string | null
          email?: string | null
          phone?: string | null
          address_street?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zip?: string | null
          address_ibge_code?: string | null
          logo_url?: string | null
          slogan?: string | null
          tax_regime?: string | null
          modo_seguro_fiscal?: boolean
          is_blocked?: boolean
          block_reason?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          pix_city?: string | null
          whatsapp_support?: string | null
          accountant_name?: string | null
          accountant_email?: string | null
          accountant_phone?: string | null
          accountant_crc?: string | null
          accountant_auto_send?: boolean | null
          accountant_send_day?: number | null
          created_at?: string
          updated_at?: string
          parent_company_id?: string | null
          crt?: number | null
          segment?: string | null
        }
      }
      company_plans: {
        Row: {
          id: string
          company_id: string
          plan: string
          status: string
          max_users: number
          fiscal_enabled: boolean
          advanced_reports_enabled: boolean
          financial_module_level: string
          created_at: string
          expires_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          plan: string
          status: string
          max_users?: number
          fiscal_enabled?: boolean
          advanced_reports_enabled?: boolean
          financial_module_level: string
          created_at?: string
          expires_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          plan?: string
          status?: string
          max_users?: number
          fiscal_enabled?: boolean
          advanced_reports_enabled?: boolean
          financial_module_level?: string
          created_at?: string
          expires_at?: string | null
          updated_at?: string
        }
      }
      company_users: {
        Row: {
          id: string
          user_id: string
          company_id: string
          role: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id: string
          role: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_id?: string
          role?: string
          is_active?: boolean
          created_at?: string
        }
      }
      contingencies: {
        Row: {
          id: string
          company_id: string
          doc_type: string
          reason: string
          auto_detected: boolean
          documents_count: number
          started_at: string
          ended_at: string | null
          resolved_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          doc_type: string
          reason: string
          auto_detected?: boolean
          documents_count?: number
          started_at?: string
          ended_at?: string | null
          resolved_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          doc_type?: string
          reason?: string
          auto_detected?: boolean
          documents_count?: number
          started_at?: string
          ended_at?: string | null
          resolved_by?: string | null
          created_at?: string
        }
      }
      credit_clients: {
        Row: {
          id: string
          company_id: string
          client_id: string | null
          name: string
          cpf: string | null
          phone: string | null
          score: number | null
          credit_limit: number | null
          credit_used: number | null
          status: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          client_id?: string | null
          name: string
          cpf?: string | null
          phone?: string | null
          score?: number | null
          credit_limit?: number | null
          credit_used?: number | null
          status?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          client_id?: string | null
          name?: string
          cpf?: string | null
          phone?: string | null
          score?: number | null
          credit_limit?: number | null
          credit_used?: number | null
          status?: string | null
          created_at?: string | null
        }
      }
      credit_installments: {
        Row: {
          id: string
          credit_client_id: string
          company_id: string
          order_id: string | null
          installment_number: string
          value: number
          due_date: string
          paid: boolean | null
          paid_date: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          credit_client_id: string
          company_id: string
          order_id?: string | null
          installment_number: string
          value: number
          due_date: string
          paid?: boolean | null
          paid_date?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          credit_client_id?: string
          company_id?: string
          order_id?: string | null
          installment_number?: string
          value?: number
          due_date?: string
          paid?: boolean | null
          paid_date?: string | null
          created_at?: string | null
        }
      }
      customer_reviews: {
        Row: {
          id: string
          company_id: string
          client_name: string
          rating: number
          comment: string
          ambiente_name: string | null
          photo_url: string | null
          created_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          company_id: string
          client_name: string
          rating: number
          comment: string
          ambiente_name?: string | null
          photo_url?: string | null
          created_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          client_name?: string
          rating?: number
          comment?: string
          ambiente_name?: string | null
          photo_url?: string | null
          created_at?: string | null
          created_by?: string | null
        }
      }
      daily_closings: {
        Row: {
          id: string
          company_id: string
          closing_date: string
          closed_by: string
          total_sales: number | null
          total_dinheiro: number | null
          total_debito: number | null
          total_credito: number | null
          total_pix: number | null
          total_outros: number | null
          total_receivables: number | null
          total_payables: number | null
          cash_balance: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          closing_date: string
          closed_by: string
          total_sales?: number | null
          total_dinheiro?: number | null
          total_debito?: number | null
          total_credito?: number | null
          total_pix?: number | null
          total_outros?: number | null
          total_receivables?: number | null
          total_payables?: number | null
          cash_balance?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          closing_date?: string
          closed_by?: string
          total_sales?: number | null
          total_dinheiro?: number | null
          total_debito?: number | null
          total_credito?: number | null
          total_pix?: number | null
          total_outros?: number | null
          total_receivables?: number | null
          total_payables?: number | null
          cash_balance?: number | null
          notes?: string | null
          created_at?: string
        }
      }
      delivery_tracking: {
        Row: {
          id: string
          company_id: string
          order_id: string | null
          client_name: string
          client_phone: string | null
          address: string
          driver_name: string | null
          driver_phone: string | null
          status: string | null
          eta: string | null
          timeline: Json | null
          tracking_code: string | null
          created_at: string | null
          delivered_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          order_id?: string | null
          client_name: string
          client_phone?: string | null
          address: string
          driver_name?: string | null
          driver_phone?: string | null
          status?: string | null
          eta?: string | null
          timeline?: Json | null
          tracking_code?: string | null
          created_at?: string | null
          delivered_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          order_id?: string | null
          client_name?: string
          client_phone?: string | null
          address?: string
          driver_name?: string | null
          driver_phone?: string | null
          status?: string | null
          eta?: string | null
          timeline?: Json | null
          tracking_code?: string | null
          created_at?: string | null
          delivered_at?: string | null
        }
      }
      diagnosticos_financeiros: {
        Row: {
          id: string
          user_id: string
          mes_referencia: string
          conteudo: string
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          mes_referencia: string
          conteudo: string
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          mes_referencia?: string
          conteudo?: string
          created_at?: string | null
        }
      }
      discount_limits: {
        Row: {
          id: string
          company_id: string
          role: string
          max_discount_percent: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          role: string
          max_discount_percent: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          role?: string
          max_discount_percent?: number
          created_at?: string | null
          updated_at?: string | null
        }
      }
      employees: {
        Row: {
          id: string
          company_id: string
          user_id: string | null
          name: string
          cpf: string | null
          rg: string | null
          role: string | null
          department: string | null
          email: string | null
          phone: string | null
          address_street: string | null
          address_number: string | null
          address_city: string | null
          address_state: string | null
          address_zip: string | null
          admission_date: string | null
          salary: number | null
          commission_rate: number | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id?: string | null
          name: string
          cpf?: string | null
          rg?: string | null
          role?: string | null
          department?: string | null
          email?: string | null
          phone?: string | null
          address_street?: string | null
          address_number?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zip?: string | null
          admission_date?: string | null
          salary?: number | null
          commission_rate?: number | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          user_id?: string | null
          name?: string
          cpf?: string | null
          rg?: string | null
          role?: string | null
          department?: string | null
          email?: string | null
          phone?: string | null
          address_street?: string | null
          address_number?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zip?: string | null
          admission_date?: string | null
          salary?: number | null
          commission_rate?: number | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      financeiro_mensal: {
        Row: {
          id: string
          user_id: string
          mes_referencia: string
          receita: number | null
          despesas: number | null
          lucro: number | null
          inadimplencia: number | null
          clientes_ativos: number | null
          percentual_maior_cliente: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          mes_referencia: string
          receita?: number | null
          despesas?: number | null
          lucro?: number | null
          inadimplencia?: number | null
          clientes_ativos?: number | null
          percentual_maior_cliente?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          mes_referencia?: string
          receita?: number | null
          despesas?: number | null
          lucro?: number | null
          inadimplencia?: number | null
          clientes_ativos?: number | null
          percentual_maior_cliente?: number | null
          created_at?: string | null
        }
      }
      financial_entries: {
        Row: {
          id: string
          company_id: string
          type: string
          category: string
          status: string
          description: string
          amount: number
          paid_amount: number | null
          due_date: string
          paid_date: string | null
          payment_method: string | null
          counterpart: string | null
          cost_center: string | null
          reference: string | null
          recurrence: string | null
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          type: string
          category: string
          status: string
          description: string
          amount: number
          paid_amount?: number | null
          due_date: string
          paid_date?: string | null
          payment_method?: string | null
          counterpart?: string | null
          cost_center?: string | null
          reference?: string | null
          recurrence?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          type?: string
          category?: string
          status?: string
          description?: string
          amount?: number
          paid_amount?: number | null
          due_date?: string
          paid_date?: string | null
          payment_method?: string | null
          counterpart?: string | null
          cost_center?: string | null
          reference?: string | null
          recurrence?: string | null
          notes?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      fiscal_audit_logs: {
        Row: {
          id: string
          company_id: string
          document_id: string | null
          doc_type: string | null
          action: string
          details: Json | null
          user_id: string | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          document_id?: string | null
          doc_type?: string | null
          action: string
          details?: Json | null
          user_id?: string | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          document_id?: string | null
          doc_type?: string | null
          action?: string
          details?: Json | null
          user_id?: string | null
          ip_address?: string | null
          created_at?: string
        }
      }
      fiscal_categories: {
        Row: {
          id: string
          company_id: string
          name: string
          regime: string
          operation_type: string
          product_type: string
          ncm: string | null
          cest: string | null
          cfop: string
          csosn: string | null
          cst_icms: string | null
          icms_rate: number
          icms_st_rate: number | null
          mva: number | null
          pis_rate: number
          cofins_rate: number
          ipi_rate: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          regime: string
          operation_type: string
          product_type: string
          ncm?: string | null
          cest?: string | null
          cfop: string
          csosn?: string | null
          cst_icms?: string | null
          icms_rate?: number
          icms_st_rate?: number | null
          mva?: number | null
          pis_rate?: number
          cofins_rate?: number
          ipi_rate?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          regime?: string
          operation_type?: string
          product_type?: string
          ncm?: string | null
          cest?: string | null
          cfop?: string
          csosn?: string | null
          cst_icms?: string | null
          icms_rate?: number
          icms_st_rate?: number | null
          mva?: number | null
          pis_rate?: number
          cofins_rate?: number
          ipi_rate?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      fiscal_configs: {
        Row: {
          id: string
          company_id: string
          doc_type: string
          environment: string
          serie: number
          next_number: number
          certificate_type: string
          certificate_path: string | null
          certificate_password_hash: string | null
          certificate_expires_at: string | null
          csc_id: string | null
          csc_token: string | null
          sat_serial_number: string | null
          sat_activation_code: string | null
          a3_subject_name: string | null
          a3_thumbprint: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          doc_type: string
          environment: string
          serie?: number
          next_number?: number
          certificate_type: string
          certificate_path?: string | null
          certificate_password_hash?: string | null
          certificate_expires_at?: string | null
          csc_id?: string | null
          csc_token?: string | null
          sat_serial_number?: string | null
          sat_activation_code?: string | null
          a3_subject_name?: string | null
          a3_thumbprint?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          doc_type?: string
          environment?: string
          serie?: number
          next_number?: number
          certificate_type?: string
          certificate_path?: string | null
          certificate_password_hash?: string | null
          certificate_expires_at?: string | null
          csc_id?: string | null
          csc_token?: string | null
          sat_serial_number?: string | null
          sat_activation_code?: string | null
          a3_subject_name?: string | null
          a3_thumbprint?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      fiscal_documents: {
        Row: {
          id: string
          company_id: string
          doc_type: string
          number: number | null
          serie: number | null
          status: string
          environment: string
          access_key: string | null
          protocol_number: string | null
          protocol_date: string | null
          total_value: number
          items_json: Json | null
          payment_method: string | null
          customer_cpf_cnpj: string | null
          customer_name: string | null
          is_contingency: boolean
          contingency_type: string | null
          contingency_reason: string | null
          issued_by: string | null
          canceled_at: string | null
          canceled_by: string | null
          cancel_reason: string | null
          cancel_protocol: string | null
          rejection_reason: string | null
          xml_sent: string | null
          xml_response: string | null
          synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          doc_type: string
          number?: number | null
          serie?: number | null
          status: string
          environment: string
          access_key?: string | null
          protocol_number?: string | null
          protocol_date?: string | null
          total_value: number
          items_json?: Json | null
          payment_method?: string | null
          customer_cpf_cnpj?: string | null
          customer_name?: string | null
          is_contingency?: boolean
          contingency_type?: string | null
          contingency_reason?: string | null
          issued_by?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          cancel_reason?: string | null
          cancel_protocol?: string | null
          rejection_reason?: string | null
          xml_sent?: string | null
          xml_response?: string | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          doc_type?: string
          number?: number | null
          serie?: number | null
          status?: string
          environment?: string
          access_key?: string | null
          protocol_number?: string | null
          protocol_date?: string | null
          total_value?: number
          items_json?: Json | null
          payment_method?: string | null
          customer_cpf_cnpj?: string | null
          customer_name?: string | null
          is_contingency?: boolean
          contingency_type?: string | null
          contingency_reason?: string | null
          issued_by?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          cancel_reason?: string | null
          cancel_protocol?: string | null
          rejection_reason?: string | null
          xml_sent?: string | null
          xml_response?: string | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      fiscal_queue: {
        Row: {
          id: string
          sale_id: string
          company_id: string
          status: string
          attempts: number | null
          last_error: string | null
          created_at: string | null
          processed_at: string | null
        }
        Insert: {
          id?: string
          sale_id: string
          company_id: string
          status: string
          attempts?: number | null
          last_error?: string | null
          created_at?: string | null
          processed_at?: string | null
        }
        Update: {
          id?: string
          sale_id?: string
          company_id?: string
          status?: string
          attempts?: number | null
          last_error?: string | null
          created_at?: string | null
          processed_at?: string | null
        }
      }
      follow_ups: {
        Row: {
          id: string
          company_id: string
          quote_id: string | null
          client_id: string | null
          assigned_to: string | null
          contact_type: string
          due_date: string
          notes: string | null
          status: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          quote_id?: string | null
          client_id?: string | null
          assigned_to?: string | null
          contact_type: string
          due_date: string
          notes?: string | null
          status: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          quote_id?: string | null
          client_id?: string | null
          assigned_to?: string | null
          contact_type?: string
          due_date?: string
          notes?: string | null
          status?: string
          completed_at?: string | null
          created_at?: string
        }
      }
      furniture_projects: {
        Row: {
          id: string
          company_id: string
          client_name: string
          room: string
          description: string | null
          before_url: string | null
          after_url: string | null
          rating: number | null
          created_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          company_id: string
          client_name: string
          room: string
          description?: string | null
          before_url?: string | null
          after_url?: string | null
          rating?: number | null
          created_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          client_name?: string
          room?: string
          description?: string | null
          before_url?: string | null
          after_url?: string | null
          rating?: number | null
          created_at?: string | null
          created_by?: string | null
        }
      }
      icms_st_rules: {
        Row: {
          id: string
          company_id: string
          fiscal_category_id: string | null
          uf_origin: string
          uf_destination: string
          ncm: string | null
          cest: string | null
          description: string | null
          mva_original: number
          mva_adjusted: number | null
          icms_internal_rate: number
          icms_interstate_rate: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          fiscal_category_id?: string | null
          uf_origin: string
          uf_destination: string
          ncm?: string | null
          cest?: string | null
          description?: string | null
          mva_original: number
          mva_adjusted?: number | null
          icms_internal_rate: number
          icms_interstate_rate: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          fiscal_category_id?: string | null
          uf_origin?: string
          uf_destination?: string
          ncm?: string | null
          cest?: string | null
          description?: string | null
          mva_original?: number
          mva_adjusted?: number | null
          icms_internal_rate?: number
          icms_interstate_rate?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      inventory_count_items: {
        Row: {
          id: string
          company_id: string
          inventory_id: string
          product_id: string
          system_quantity: number
          counted_quantity: number | null
          difference: number | null
          counted_at: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          inventory_id: string
          product_id: string
          system_quantity: number
          counted_quantity?: number | null
          difference?: number | null
          counted_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          inventory_id?: string
          product_id?: string
          system_quantity?: number
          counted_quantity?: number | null
          difference?: number | null
          counted_at?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      inventory_counts: {
        Row: {
          id: string
          company_id: string
          name: string
          status: string
          performed_by: string
          started_at: string
          finished_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          status: string
          performed_by: string
          started_at?: string
          finished_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          status?: string
          performed_by?: string
          started_at?: string
          finished_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      loyalty_config: {
        Row: {
          id: string
          company_id: string
          is_active: boolean
          points_per_real: number
          redemption_value: number
          min_redemption_points: number
          birthday_multiplier: number
        }
        Insert: {
          id?: string
          company_id: string
          is_active?: boolean
          points_per_real?: number
          redemption_value?: number
          min_redemption_points?: number
          birthday_multiplier?: number
        }
        Update: {
          id?: string
          company_id?: string
          is_active?: boolean
          points_per_real?: number
          redemption_value?: number
          min_redemption_points?: number
          birthday_multiplier?: number
        }
      }
      loyalty_points: {
        Row: {
          id: string
          company_id: string
          client_id: string
          points: number
          source: string | null
          sale_id: string | null
          created_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          company_id: string
          client_id: string
          points: number
          source?: string | null
          sale_id?: string | null
          created_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          client_id?: string
          points?: number
          source?: string | null
          sale_id?: string | null
          created_at?: string | null
          created_by?: string | null
        }
      }
      loyalty_transactions: {
        Row: {
          id: string
          company_id: string
          client_id: string
          sale_id: string | null
          type: string
          points: number
          balance_after: number
          description: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          client_id: string
          sale_id?: string | null
          type: string
          points: number
          balance_after: number
          description?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          client_id?: string
          sale_id?: string | null
          type?: string
          points?: number
          balance_after?: number
          description?: string | null
          created_by?: string | null
          created_at?: string
        }
      }
      nfe_imports: {
        Row: {
          id: string
          company_id: string
          access_key: string
          nfe_number: string | null
          supplier_name: string | null
          supplier_cnpj: string | null
          total_value: number | null
          products_count: number | null
          imported_at: string | null
          imported_by: string | null
        }
        Insert: {
          id?: string
          company_id: string
          access_key: string
          nfe_number?: string | null
          supplier_name?: string | null
          supplier_cnpj?: string | null
          total_value?: number | null
          products_count?: number | null
          imported_at?: string | null
          imported_by?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          access_key?: string
          nfe_number?: string | null
          supplier_name?: string | null
          supplier_cnpj?: string | null
          total_value?: number | null
          products_count?: number | null
          imported_at?: string | null
          imported_by?: string | null
        }
      }
      notification_reads: {
        Row: {
          id: string
          notification_id: string
          user_id: string
          read_at: string | null
        }
        Insert: {
          id?: string
          notification_id: string
          user_id: string
          read_at?: string | null
        }
        Update: {
          id?: string
          notification_id?: string
          user_id?: string
          read_at?: string | null
        }
      }
      payment_history: {
        Row: {
          id: string
          user_id: string
          subscription_id: string | null
          plan_key: string
          amount: number
          status: string
          mp_payment_id: string | null
          mp_preference_id: string | null
          payment_method: string | null
          paid_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subscription_id?: string | null
          plan_key: string
          amount: number
          status: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          payment_method?: string | null
          paid_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subscription_id?: string | null
          plan_key?: string
          amount?: number
          status?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          payment_method?: string | null
          paid_at?: string | null
          created_at?: string
        }
      }
      payment_webhook_logs: {
        Row: {
          id: string
          mp_payment_id: string | null
          event_type: string
          status: string | null
          amount: number | null
          plan_key: string | null
          user_id: string | null
          company_id: string | null
          raw_payload: Json | null
          error_message: string | null
          processed: boolean
          retry_count: number
          created_at: string
        }
        Insert: {
          id?: string
          mp_payment_id?: string | null
          event_type: string
          status?: string | null
          amount?: number | null
          plan_key?: string | null
          user_id?: string | null
          company_id?: string | null
          raw_payload?: Json | null
          error_message?: string | null
          processed?: boolean
          retry_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          mp_payment_id?: string | null
          event_type?: string
          status?: string | null
          amount?: number | null
          plan_key?: string | null
          user_id?: string | null
          company_id?: string | null
          raw_payload?: Json | null
          error_message?: string | null
          processed?: boolean
          retry_count?: number
          created_at?: string
        }
      }
      payments: {
        Row: {
          id: string
          company_id: string | null
          user_id: string | null
          plan_key: string
          amount: number
          method: string | null
          status: string
          transaction_id: string | null
          mp_preference_id: string | null
          mp_payment_id: string | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          user_id?: string | null
          plan_key: string
          amount: number
          method?: string | null
          status: string
          transaction_id?: string | null
          mp_preference_id?: string | null
          mp_payment_id?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          user_id?: string | null
          plan_key?: string
          amount?: number
          method?: string | null
          status?: string
          transaction_id?: string | null
          mp_preference_id?: string | null
          mp_payment_id?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      permissions: {
        Row: {
          id: string
          role: string
          module: string
          can_view: boolean
          can_create: boolean
          can_edit: boolean
          can_delete: boolean
        }
        Insert: {
          id?: string
          role: string
          module: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
        }
        Update: {
          id?: string
          role?: string
          module?: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
        }
      }
      pix_payments: {
        Row: {
          id: string
          company_id: string
          external_reference: string
          amount: number
          description: string | null
          status: string
          qr_code: string | null
          qr_code_base64: string | null
          ticket_url: string | null
          mp_payment_id: string | null
          created_by: string
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          external_reference: string
          amount: number
          description?: string | null
          status: string
          qr_code?: string | null
          qr_code_base64?: string | null
          ticket_url?: string | null
          mp_payment_id?: string | null
          created_by: string
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          external_reference?: string
          amount?: number
          description?: string | null
          status?: string
          qr_code?: string | null
          qr_code_base64?: string | null
          ticket_url?: string | null
          mp_payment_id?: string | null
          created_by?: string
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      price_history: {
        Row: {
          id: string
          company_id: string
          product_id: string
          field_changed: string
          old_value: number
          new_value: number
          changed_by: string | null
          changed_at: string
          source: string
        }
        Insert: {
          id?: string
          company_id: string
          product_id: string
          field_changed: string
          old_value: number
          new_value: number
          changed_by?: string | null
          changed_at?: string
          source: string
        }
        Update: {
          id?: string
          company_id?: string
          product_id?: string
          field_changed?: string
          old_value?: number
          new_value?: number
          changed_by?: string | null
          changed_at?: string
          source?: string
        }
      }
      processing_jobs: {
        Row: {
          id: string
          company_id: string
          type: string
          status: string
          progress: number | null
          result: Json | null
          error: string | null
          params: Json | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          type: string
          status: string
          progress?: number | null
          result?: Json | null
          error?: string | null
          params?: Json | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          type?: string
          status?: string
          progress?: number | null
          result?: Json | null
          error?: string | null
          params?: Json | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      product_categories: {
        Row: {
          id: string
          company_id: string
          parent_id: string | null
          name: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          parent_id?: string | null
          name: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          parent_id?: string | null
          name?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      product_extras: {
        Row: {
          id: string
          company_id: string
          product_id: string
          volumes: Json | null
          variations: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          product_id: string
          volumes?: Json | null
          variations?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          product_id?: string
          volumes?: Json | null
          variations?: Json | null


        }
      }
      product_labels: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      product_lots: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      production_order_items: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      production_orders: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      products: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      profiles: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      promotions: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      purchase_order_items: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      purchase_orders: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      quotes: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      recipe_ingredients: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      recipes: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      reseller_licenses: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      resellers: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      sale_items: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      sales: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      stock_movements: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      stock_transfer_items: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      stock_transfers: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      subscriptions: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      suppliers: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      support_messages: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      system_errors: {
        Row: {
          id: string
          user_id: string | null
          user_email: string | null
          page: string
          action: string
          error_message: string
          error_stack: string
          browser: string
          device: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          user_email?: string | null
          page?: string
          action?: string
          error_message: string
          error_stack?: string
          browser?: string
          device?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          user_email?: string | null
          page?: string
          action?: string
          error_message?: string
          error_stack?: string
          browser?: string
          device?: string
          created_at?: string
        }
      }
      tef_config: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
      terms_acceptance: {
        Row: Record<string, any>
        Insert: Record<string, any>
        Update: Record<string, any>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_sale_atomic: {
        Args: {
          p_sale_id: string
          p_company_id: string
          p_user_id: string
          p_items: Json
          p_refund_amount: number
          p_reason?: string
        }
        Returns: Json
      }
      finalize_sale_atomic: {
        Args: {
          p_company_id: string
          p_terminal_id: string
          p_session_id: string | null
          p_items: Json
          p_subtotal: number
          p_discount_pct: number
          p_discount_val: number
          p_total: number
          p_payments: Json
          p_sold_by?: string | null
        }
        Returns: Json
      }
      mark_financial_entry_paid_atomic: {
        Args: {
          p_company_id: string
          p_entry_id: string
          p_paid_amount: number
          p_payment_method: string
          p_performed_by: string
        }
        Returns: Json
      }
      next_receipt_number: {
        Args: {
          p_company_id: string
          p_type?: string
        }
        Returns: number
      }
      receive_credit_payment_atomic: {
        Args: {
          p_company_id: string
          p_client_id: string
          p_paid_amount: number
          p_payment_method: string
          p_performed_by: string
        }
        Returns: Json
      }
    }
    Enums: {
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
