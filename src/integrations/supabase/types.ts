export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          address: string | null
          address_city: string | null
          address_ibge_code: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          cep: string | null
          city: string | null
          city_code: string | null
          cnpj: string | null
          complement: string | null
          created_at: string
          crt: number | null
          email: string | null
          ibge_code: string | null
          id: string
          ie: string | null
          is_active: boolean
          is_demo: boolean
          name: string
          neighborhood: string | null
          number: string | null
          parent_company_id: string | null
          phone: string | null
          state: string | null
          state_registration: string | null
          street: string | null
          trade_name: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_city?: string | null
          address_ibge_code?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          cep?: string | null
          city?: string | null
          city_code?: string | null
          cnpj?: string | null
          complement?: string | null
          created_at?: string
          crt?: number | null
          email?: string | null
          ibge_code?: string | null
          id?: string
          ie?: string | null
          is_active?: boolean
          is_demo?: boolean
          name?: string
          neighborhood?: string | null
          number?: string | null
          parent_company_id?: string | null
          phone?: string | null
          state?: string | null
          state_registration?: string | null
          street?: string | null
          trade_name?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_city?: string | null
          address_ibge_code?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          cep?: string | null
          city?: string | null
          city_code?: string | null
          cnpj?: string | null
          complement?: string | null
          created_at?: string
          crt?: number | null
          email?: string | null
          ibge_code?: string | null
          id?: string
          ie?: string | null
          is_active?: boolean
          is_demo?: boolean
          name?: string
          neighborhood?: string | null
          number?: string | null
          parent_company_id?: string | null
          phone?: string | null
          state?: string | null
          state_registration?: string | null
          street?: string | null
          trade_name?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dfe_sync_control: {
        Row: {
          company_id: string
          id: string
          ultima_consulta: string | null
          ultimo_nsu: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          id?: string
          ultima_consulta?: string | null
          ultimo_nsu?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          id?: string
          ultima_consulta?: string | null
          ultimo_nsu?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dfe_sync_control_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_configs: {
        Row: {
          a3_thumbprint: string | null
          ambiente: string | null
          certificate_password_hash: string | null
          certificate_path: string | null
          company_id: string
          created_at: string
          csc_id: string | null
          csc_token: string | null
          doc_type: string
          environment: string
          id: string
          ie: string | null
          is_active: boolean
          next_number: number
          serie: number
          updated_at: string
        }
        Insert: {
          a3_thumbprint?: string | null
          ambiente?: string | null
          certificate_password_hash?: string | null
          certificate_path?: string | null
          company_id: string
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          doc_type?: string
          environment?: string
          id?: string
          ie?: string | null
          is_active?: boolean
          next_number?: number
          serie?: number
          updated_at?: string
        }
        Update: {
          a3_thumbprint?: string | null
          ambiente?: string | null
          certificate_password_hash?: string | null
          certificate_path?: string | null
          company_id?: string
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          doc_type?: string
          environment?: string
          id?: string
          ie?: string | null
          is_active?: boolean
          next_number?: number
          serie?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_ncm_mapping: {
        Row: {
          categoria: string
          cest: string | null
          company_id: string | null
          confianca: number
          created_at: string
          descricao_pattern: string | null
          id: string
          is_active: boolean
          is_global: boolean
          ncm: string
          observacoes: string | null
          updated_at: string
          variacao: string | null
        }
        Insert: {
          categoria: string
          cest?: string | null
          company_id?: string | null
          confianca?: number
          created_at?: string
          descricao_pattern?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          ncm: string
          observacoes?: string | null
          updated_at?: string
          variacao?: string | null
        }
        Update: {
          categoria?: string
          cest?: string | null
          company_id?: string | null
          confianca?: number
          created_at?: string
          descricao_pattern?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          ncm?: string
          observacoes?: string | null
          updated_at?: string
          variacao?: string | null
        }
        Relationships: []
      }
      fiscal_override_rules: {
        Row: {
          aliquota_forcada: number | null
          company_id: string
          created_at: string
          csosn_forcado: string | null
          cst_forcado: string | null
          forcar_st: boolean | null
          id: string
          is_active: boolean
          motivo: string | null
          mva_forcado: number | null
          ncm: string
          prioridade: number
          reducao_bc_forcada: number | null
          uf: string
          updated_at: string
        }
        Insert: {
          aliquota_forcada?: number | null
          company_id: string
          created_at?: string
          csosn_forcado?: string | null
          cst_forcado?: string | null
          forcar_st?: boolean | null
          id?: string
          is_active?: boolean
          motivo?: string | null
          mva_forcado?: number | null
          ncm: string
          prioridade?: number
          reducao_bc_forcada?: number | null
          uf?: string
          updated_at?: string
        }
        Update: {
          aliquota_forcada?: number | null
          company_id?: string
          created_at?: string
          csosn_forcado?: string | null
          cst_forcado?: string | null
          forcar_st?: boolean | null
          id?: string
          is_active?: boolean
          motivo?: string | null
          mva_forcado?: number | null
          ncm?: string
          prioridade?: number
          reducao_bc_forcada?: number | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      fiscal_st_decision_log: {
        Row: {
          aplicou_st: boolean
          block_reason: string | null
          blocked: boolean
          cest: string | null
          company_id: string | null
          confianca: string
          convenio: string | null
          created_at: string
          id: string
          motivo: string | null
          mva: number
          ncm: string
          override_aplicado: boolean
          regra_usada: string
          risk_score: number
          uf: string
        }
        Insert: {
          aplicou_st?: boolean
          block_reason?: string | null
          blocked?: boolean
          cest?: string | null
          company_id?: string | null
          confianca?: string
          convenio?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          mva?: number
          ncm: string
          override_aplicado?: boolean
          regra_usada?: string
          risk_score?: number
          uf: string
        }
        Update: {
          aplicou_st?: boolean
          block_reason?: string | null
          blocked?: boolean
          cest?: string | null
          company_id?: string | null
          confianca?: string
          convenio?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          mva?: number
          ncm?: string
          override_aplicado?: boolean
          regra_usada?: string
          risk_score?: number
          uf?: string
        }
        Relationships: []
      }
      fiscal_st_rules: {
        Row: {
          aliquota: number
          cest: string | null
          company_id: string | null
          convenio: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string
          exige_cest: boolean
          exige_st: boolean
          id: string
          is_active: boolean
          is_global: boolean
          mva: number
          ncm: string
          observacoes: string | null
          protocolo: string | null
          reducao_bc: number
          segmento: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          aliquota?: number
          cest?: string | null
          company_id?: string | null
          convenio?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          exige_cest?: boolean
          exige_st?: boolean
          id?: string
          is_active?: boolean
          is_global?: boolean
          mva?: number
          ncm: string
          observacoes?: string | null
          protocolo?: string | null
          reducao_bc?: number
          segmento?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          aliquota?: number
          cest?: string | null
          company_id?: string | null
          convenio?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          exige_cest?: boolean
          exige_st?: boolean
          id?: string
          is_active?: boolean
          is_global?: boolean
          mva?: number
          ncm?: string
          observacoes?: string | null
          protocolo?: string | null
          reducao_bc?: number
          segmento?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      fiscal_tax_rules: {
        Row: {
          aliq_cofins: number
          aliq_pis: number
          cest: string | null
          company_id: string | null
          created_at: string
          csosn: string | null
          cst: string | null
          descricao: string | null
          icms_aliquota: number
          icms_reducao_base: number
          id: string
          is_active: boolean
          is_global: boolean
          mva: number
          ncm_prefix: string
          prioridade: number
          regime: string
          tem_st: boolean
          tipo_pis_cofins: string
          uf_destino: string
          uf_origem: string
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          aliq_cofins?: number
          aliq_pis?: number
          cest?: string | null
          company_id?: string | null
          created_at?: string
          csosn?: string | null
          cst?: string | null
          descricao?: string | null
          icms_aliquota?: number
          icms_reducao_base?: number
          id?: string
          is_active?: boolean
          is_global?: boolean
          mva?: number
          ncm_prefix: string
          prioridade?: number
          regime: string
          tem_st?: boolean
          tipo_pis_cofins?: string
          uf_destino?: string
          uf_origem?: string
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          aliq_cofins?: number
          aliq_pis?: number
          cest?: string | null
          company_id?: string | null
          created_at?: string
          csosn?: string | null
          cst?: string | null
          descricao?: string | null
          icms_aliquota?: number
          icms_reducao_base?: number
          id?: string
          is_active?: boolean
          is_global?: boolean
          mva?: number
          ncm_prefix?: string
          prioridade?: number
          regime?: string
          tem_st?: boolean
          tipo_pis_cofins?: string
          uf_destino?: string
          uf_origem?: string
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: []
      }
      nfe_documents: {
        Row: {
          chave_nfe: string
          company_id: string
          created_at: string
          data_emissao: string
          id: string
          modelo: number
          numero: number
          nuvem_fiscal_id: string | null
          protocolo: string | null
          sale_id: string | null
          serie: number
          status: string
          updated_at: string
          valor_total: number
          xml_autorizado: string | null
          xml_enviado: string | null
        }
        Insert: {
          chave_nfe: string
          company_id: string
          created_at?: string
          data_emissao?: string
          id?: string
          modelo?: number
          numero: number
          nuvem_fiscal_id?: string | null
          protocolo?: string | null
          sale_id?: string | null
          serie?: number
          status?: string
          updated_at?: string
          valor_total?: number
          xml_autorizado?: string | null
          xml_enviado?: string | null
        }
        Update: {
          chave_nfe?: string
          company_id?: string
          created_at?: string
          data_emissao?: string
          id?: string
          modelo?: number
          numero?: number
          nuvem_fiscal_id?: string | null
          protocolo?: string | null
          sale_id?: string | null
          serie?: number
          status?: string
          updated_at?: string
          valor_total?: number
          xml_autorizado?: string | null
          xml_enviado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfe_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_recebidas: {
        Row: {
          chave_nfe: string
          cnpj_emitente: string | null
          company_id: string
          created_at: string
          data_emissao: string | null
          id: string
          importado: boolean | null
          importado_em: string | null
          nome_emitente: string | null
          nsu: number | null
          numero_nfe: number | null
          nuvem_fiscal_id: string | null
          schema_tipo: string | null
          serie: number | null
          situacao: string | null
          status_manifestacao: string | null
          updated_at: string
          valor_total: number | null
          xml_completo: string | null
        }
        Insert: {
          chave_nfe: string
          cnpj_emitente?: string | null
          company_id: string
          created_at?: string
          data_emissao?: string | null
          id?: string
          importado?: boolean | null
          importado_em?: string | null
          nome_emitente?: string | null
          nsu?: number | null
          numero_nfe?: number | null
          nuvem_fiscal_id?: string | null
          schema_tipo?: string | null
          serie?: number | null
          situacao?: string | null
          status_manifestacao?: string | null
          updated_at?: string
          valor_total?: number | null
          xml_completo?: string | null
        }
        Update: {
          chave_nfe?: string
          cnpj_emitente?: string | null
          company_id?: string
          created_at?: string
          data_emissao?: string | null
          id?: string
          importado?: boolean | null
          importado_em?: string | null
          nome_emitente?: string | null
          nsu?: number | null
          numero_nfe?: number | null
          nuvem_fiscal_id?: string | null
          schema_tipo?: string | null
          serie?: number | null
          situacao?: string | null
          status_manifestacao?: string | null
          updated_at?: string
          valor_total?: number | null
          xml_completo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_recebidas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_company_memberships: { Args: never; Returns: Json }
      get_st_override: {
        Args: { p_company_id: string; p_ncm: string; p_uf: string }
        Returns: Json
      }
      resolve_ncm_mapping: {
        Args: {
          p_categoria: string
          p_company_id: string
          p_descricao: string
          p_variacao: string
        }
        Returns: Json
      }
      resolve_st_from_db: {
        Args: { p_ncm: string; p_tipo_operacao?: string; p_uf: string }
        Returns: Json
      }
      user_belongs_to_company: {
        Args: { p_company_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
