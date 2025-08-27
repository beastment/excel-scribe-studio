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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      ai_configurations: {
        Row: {
          analysis_prompt: string
          created_at: string
          id: string
          model: string
          preferred_batch_size: number | null
          provider: string
          redact_prompt: string
          rephrase_prompt: string
          rpm_limit: number | null
          scanner_type: string
          tpm_limit: number | null
          updated_at: string
          scan_a_io_ratio: number | null
          scan_b_io_ratio: number | null
          adjudicator_io_ratio: number | null
          redaction_io_ratio: number | null
          rephrase_io_ratio: number | null
        }
        Insert: {
          analysis_prompt: string
          created_at?: string
          id?: string
          model: string
          preferred_batch_size?: number | null
          provider: string
          redact_prompt: string
          rephrase_prompt: string
          rpm_limit?: number | null
          scanner_type: string
          tpm_limit?: number | null
          updated_at?: string
          scan_a_io_ratio?: number | null
          scan_b_io_ratio?: number | null
          adjudicator_io_ratio?: number | null
          redaction_io_ratio?: number | null
          rephrase_io_ratio?: number | null
        }
        Update: {
          analysis_prompt?: string
          created_at?: string
          id?: string
          model?: string
          preferred_batch_size?: number | null
          provider?: string
          redact_prompt?: string
          rephrase_prompt?: string
          rpm_limit?: number | null
          scanner_type?: string
          tpm_limit?: number | null
          updated_at?: string
          scan_a_io_ratio?: number | null
          scan_b_io_ratio?: number | null
          adjudicator_io_ratio?: number | null
          redaction_io_ratio?: number | null
          rephrase_io_ratio?: number | null
        }
        Relationships: []
      }
      app_configurations: {
        Row: {
          app_id: string
          created_at: string
          description: string | null
          id: string
          is_blurred: boolean
          is_enabled: boolean
          is_hidden: boolean
          name: string
          position: number | null
          status: string
          updated_at: string
        }
        Insert: {
          app_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_blurred?: boolean
          is_enabled?: boolean
          is_hidden?: boolean
          name: string
          position?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_blurred?: boolean
          is_enabled?: boolean
          is_hidden?: boolean
          name?: string
          position?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          attempts: number
          created_at: string
          first_attempt: string
          id: string
          ip: unknown
          is_locked: boolean
          lockout_until: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          first_attempt?: string
          id?: string
          ip: unknown
          is_locked?: boolean
          lockout_until?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          first_attempt?: string
          id?: string
          ip?: unknown
          is_locked?: boolean
          lockout_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      comment_sessions: {
        Row: {
          comments_data: Json
          created_at: string
          default_mode: string
          has_scan_run: boolean
          id: string
          scroll_position: number | null
          session_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comments_data: Json
          created_at?: string
          default_mode?: string
          has_scan_run?: boolean
          id?: string
          scroll_position?: number | null
          session_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comments_data?: Json
          created_at?: string
          default_mode?: string
          has_scan_run?: boolean
          id?: string
          scroll_position?: number | null
          session_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      consulting_services: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_blurred: boolean
          is_enabled: boolean
          is_hidden: boolean
          name: string
          position: number | null
          service_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_blurred?: boolean
          is_enabled?: boolean
          is_hidden?: boolean
          name: string
          position?: number | null
          service_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_blurred?: boolean
          is_enabled?: boolean
          is_hidden?: boolean
          name?: string
          position?: number | null
          service_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      consulting_services_settings: {
        Row: {
          id: string
          is_enabled: boolean
          section_subtitle: string
          section_title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_enabled?: boolean
          section_subtitle?: string
          section_title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_enabled?: boolean
          section_subtitle?: string
          section_title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      content_edits: {
        Row: {
          content_key: string
          created_at: string
          edited_by: string
          edited_content: string
          id: string
          original_content: string
          updated_at: string
        }
        Insert: {
          content_key: string
          created_at?: string
          edited_by: string
          edited_content: string
          id?: string
          original_content: string
          updated_at?: string
        }
        Update: {
          content_key?: string
          created_at?: string
          edited_by?: string
          edited_content?: string
          id?: string
          original_content?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_packages: {
        Row: {
          created_at: string
          credits: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_usd: number
        }
        Insert: {
          created_at?: string
          credits: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_usd: number
        }
        Update: {
          created_at?: string
          credits?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_usd?: number
        }
        Relationships: []
      }
      credit_pricing_tiers: {
        Row: {
          base_cost_cents: number
          created_at: string
          id: string
          max_credits: number | null
          min_credits: number
          price_per_credit_cents: number
          tier_name: string
          updated_at: string
        }
        Insert: {
          base_cost_cents?: number
          created_at?: string
          id?: string
          max_credits?: number | null
          min_credits: number
          price_per_credit_cents: number
          tier_name: string
          updated_at?: string
        }
        Update: {
          base_cost_cents?: number
          created_at?: string
          id?: string
          max_credits?: number | null
          min_credits?: number
          price_per_credit_cents?: number
          tier_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_usage: {
        Row: {
          comments_scanned: number
          created_at: string
          credits_used: number
          id: string
          scan_run_id: string
          scan_type: string
          user_id: string
        }
        Insert: {
          comments_scanned: number
          created_at?: string
          credits_used: number
          id?: string
          scan_run_id: string
          scan_type?: string
          user_id: string
        }
        Update: {
          comments_scanned?: number
          created_at?: string
          credits_used?: number
          id?: string
          scan_run_id?: string
          scan_type?: string
          user_id?: string
        }
        Relationships: []
      }
      maintenance_mode: {
        Row: {
          id: string
          is_enabled: boolean
          message: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_enabled?: boolean
          message?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_enabled?: boolean
          message?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      model_configurations: {
        Row: {
          created_at: string
          id: string
          input_token_limit: number | null
          model: string
          output_token_limit: number | null
          provider: string
          rpm_limit: number | null
          tpm_limit: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_token_limit?: number | null
          model: string
          output_token_limit?: number | null
          provider: string
          rpm_limit?: number | null
          tpm_limit?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          input_token_limit?: number | null
          model?: string
          output_token_limit?: number | null
          provider?: string
          rpm_limit?: number | null
          tpm_limit?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credits: number
          full_name: string | null
          id: string
          last_login_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credits?: number
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credits?: number
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          available_credits: number
          created_at: string
          id: string
          total_credits_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_credits?: number
          created_at?: string
          id?: string
          total_credits_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_credits?: number
          created_at?: string
          id?: string
          total_credits_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          product_id: string
          tokens_remaining: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          tokens_remaining?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          product_id?: string
          tokens_remaining?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_credits: {
        Args: { amount: number; user_uuid: string }
        Returns: boolean
      }
      add_user_credits: {
        Args: { credits_to_add: number; user_uuid: string }
        Returns: boolean
      }
      cleanup_auth_rate_limits: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      deduct_credits: {
        Args: { amount: number; user_uuid: string }
        Returns: boolean
      }
      deduct_user_credits: {
        Args: {
          comments_scanned: number
          credits_to_deduct: number
          scan_run_id: string
          scan_type?: string
          user_uuid: string
        }
        Returns: boolean
      }
      get_maintenance_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          is_enabled: boolean
          message: string
        }[]
      }
      get_or_create_user_credits: {
        Args: { user_uuid: string }
        Returns: {
          available_credits: number
          created_at: string
          id: string
          total_credits_used: number
          updated_at: string
          user_id: string
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      is_partner: {
        Args: { user_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "partner"
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
    Enums: {
      app_role: ["admin", "user", "partner"],
    },
  },
} as const
