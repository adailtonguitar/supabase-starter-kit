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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_st_override: {
        Args: { p_company_id: string; p_ncm: string; p_uf: string }
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
