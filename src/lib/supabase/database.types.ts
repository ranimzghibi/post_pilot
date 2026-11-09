// Fichier généré par scripts/gen-db-types.mjs : ne pas modifier à la main.
// Relancer `npm run db:types` après chaque changement de migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_generations: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string | null;
          user_id: string | null;
          feature: string;
          provider: string;
          model: string;
          prompt_version: string;
          brand_profile_version: number | null;
          prompt: string;
          input_tokens: number;
          output_tokens: number;
          cached_input_tokens: number;
          cost_usd: number;
          latency_ms: number | null;
          status: string;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id?: string | null;
          user_id?: string | null;
          feature: string;
          provider: string;
          model: string;
          prompt_version: string;
          brand_profile_version?: number | null;
          prompt?: string;
          input_tokens?: number;
          output_tokens?: number;
          cached_input_tokens?: number;
          cost_usd?: number;
          latency_ms?: number | null;
          status?: string;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string | null;
          user_id?: string | null;
          feature?: string;
          provider?: string;
          model?: string;
          prompt_version?: string;
          brand_profile_version?: number | null;
          prompt?: string;
          input_tokens?: number;
          output_tokens?: number;
          cached_input_tokens?: number;
          cost_usd?: number;
          latency_ms?: number | null;
          status?: string;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "ai_generations_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "ai_generations_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      brand_news: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          kind: string;
          title: string;
          details: string;
          starts_on: string | null;
          ends_on: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          kind?: string;
          title: string;
          details?: string;
          starts_on?: string | null;
          ends_on?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          kind?: string;
          title?: string;
          details?: string;
          starts_on?: string | null;
          ends_on?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "brand_news_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "brand_news_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      brand_onboarding: {
        Row: {
          brand_id: string;
          organization_id: string;
          answers: Json;
          website_snapshot: Json | null;
          recent_posts: Json | null;
          current_step: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          brand_id: string;
          organization_id: string;
          answers?: Json;
          website_snapshot?: Json | null;
          recent_posts?: Json | null;
          current_step?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          brand_id?: string;
          organization_id?: string;
          answers?: Json;
          website_snapshot?: Json | null;
          recent_posts?: Json | null;
          current_step?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "brand_onboarding_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
        ];
      };
      brand_profiles: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          version: number;
          summary: string;
          audience: string;
          tone: string;
          vocabulary: string[];
          avoid: string[];
          emoji_usage: string;
          examples: Json;
          visual_identity: Json;
          source: string;
          change_note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          version?: number;
          summary?: string;
          audience?: string;
          tone?: string;
          vocabulary?: string[];
          avoid?: string[];
          emoji_usage?: string;
          examples?: Json;
          visual_identity?: Json;
          source?: string;
          change_note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          version?: number;
          summary?: string;
          audience?: string;
          tone?: string;
          vocabulary?: string[];
          avoid?: string[];
          emoji_usage?: string;
          examples?: Json;
          visual_identity?: Json;
          source?: string;
          change_note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "brand_profiles_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "brand_profiles_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      brands: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          website_url: string | null;
          industry: string | null;
          description: string | null;
          timezone: string;
          languages: string[];
          autopilot_mode: Database["public"]["Enums"]["autopilot_mode"];
          onboarding_completed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          website_url?: string | null;
          industry?: string | null;
          description?: string | null;
          timezone?: string;
          languages?: string[];
          autopilot_mode?: Database["public"]["Enums"]["autopilot_mode"];
          onboarding_completed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          website_url?: string | null;
          industry?: string | null;
          description?: string | null;
          timezone?: string;
          languages?: string[];
          autopilot_mode?: Database["public"]["Enums"]["autopilot_mode"];
          onboarding_completed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "brands_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "brands_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
        ];
      };
      calendar_ideas: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          strategy_id: string;
          planned_on: string;
          networks: string[];
          pillar: string;
          format: string;
          title: string;
          angle: string;
          local_event_id: string | null;
          news_id: string | null;
          status: Database["public"]["Enums"]["idea_status"];
          is_locked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          strategy_id: string;
          planned_on: string;
          networks?: string[];
          pillar: string;
          format?: string;
          title: string;
          angle?: string;
          local_event_id?: string | null;
          news_id?: string | null;
          status?: Database["public"]["Enums"]["idea_status"];
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          strategy_id?: string;
          planned_on?: string;
          networks?: string[];
          pillar?: string;
          format?: string;
          title?: string;
          angle?: string;
          local_event_id?: string | null;
          news_id?: string | null;
          status?: Database["public"]["Enums"]["idea_status"];
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "calendar_ideas_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "calendar_ideas_local_event_id_fkey"; columns: ["local_event_id"]; isOneToOne: false; referencedRelation: "local_events"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_ideas_news_id_organization_id_fkey"; columns: ["news_id","organization_id"]; isOneToOne: false; referencedRelation: "brand_news"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "calendar_ideas_strategy_id_organization_id_fkey"; columns: ["strategy_id","organization_id"]; isOneToOne: false; referencedRelation: "strategies"; referencedColumns: ["id","organization_id"] },
        ];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: Database["public"]["Enums"]["org_role"];
          token_hash: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role: Database["public"]["Enums"]["org_role"];
          token_hash: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["org_role"];
          token_hash?: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "invitations_invited_by_fkey"; columns: ["invited_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "invitations_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
        ];
      };
      knowledge_chunks: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          document_id: string;
          chunk_index: number;
          content: string;
          tsv: unknown | null;
          embedding: string | null;
          embedding_model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          document_id: string;
          chunk_index: number;
          content: string;
          embedding?: string | null;
          embedding_model?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          document_id?: string;
          chunk_index?: number;
          content?: string;
          embedding?: string | null;
          embedding_model?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "knowledge_chunks_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "knowledge_chunks_document_id_organization_id_fkey"; columns: ["document_id","organization_id"]; isOneToOne: false; referencedRelation: "knowledge_documents"; referencedColumns: ["id","organization_id"] },
        ];
      };
      knowledge_documents: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          source_type: string;
          title: string;
          status: Database["public"]["Enums"]["document_status"];
          storage_path: string | null;
          raw_text: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          char_count: number;
          chunk_count: number;
          error: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          source_type: string;
          title: string;
          status?: Database["public"]["Enums"]["document_status"];
          storage_path?: string | null;
          raw_text?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          char_count?: number;
          chunk_count?: number;
          error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          source_type?: string;
          title?: string;
          status?: Database["public"]["Enums"]["document_status"];
          storage_path?: string | null;
          raw_text?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          char_count?: number;
          chunk_count?: number;
          error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "knowledge_documents_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "knowledge_documents_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      local_events: {
        Row: {
          id: string;
          slug: string;
          event_date: string;
          end_date: string | null;
          country: string;
          category: string;
          names: Json;
          sectors: string[];
          is_estimated: boolean;
        };
        Insert: {
          id?: string;
          slug: string;
          event_date: string;
          end_date?: string | null;
          country?: string;
          category: string;
          names: Json;
          sectors?: string[];
          is_estimated?: boolean;
        };
        Update: {
          id?: string;
          slug?: string;
          event_date?: string;
          end_date?: string | null;
          country?: string;
          category?: string;
          names?: Json;
          sectors?: string[];
          is_estimated?: boolean;
        };
        Relationships: [
        ];
      };
      media_assets: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          kind: string;
          source: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          width: number | null;
          height: number | null;
          alt: string;
          prompt: string | null;
          ai_generation_id: string | null;
          project_id: string | null;
          position: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          kind?: string;
          source: string;
          storage_path: string;
          mime_type: string;
          size_bytes?: number;
          width?: number | null;
          height?: number | null;
          alt?: string;
          prompt?: string | null;
          ai_generation_id?: string | null;
          project_id?: string | null;
          position?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          kind?: string;
          source?: string;
          storage_path?: string;
          mime_type?: string;
          size_bytes?: number;
          width?: number | null;
          height?: number | null;
          alt?: string;
          prompt?: string | null;
          ai_generation_id?: string | null;
          project_id?: string | null;
          position?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "media_assets_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "media_assets_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "media_assets_project_id_organization_id_fkey"; columns: ["project_id","organization_id"]; isOneToOne: false; referencedRelation: "visual_projects"; referencedColumns: ["id","organization_id"] },
        ];
      };
      memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["org_role"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["org_role"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "memberships_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "memberships_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          plan: Database["public"]["Enums"]["plan_code"];
          trial_ends_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          plan?: Database["public"]["Enums"]["plan_code"];
          trial_ends_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          plan?: Database["public"]["Enums"]["plan_code"];
          trial_ends_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "organizations_plan_fkey"; columns: ["plan"]; isOneToOne: false; referencedRelation: "plans"; referencedColumns: ["code"] },
        ];
      };
      plans: {
        Row: {
          code: Database["public"]["Enums"]["plan_code"];
          name: string;
          price_tnd: number;
          max_brands: number;
          max_social_accounts: number;
          max_members: number;
          posts_per_month: number;
          images_per_month: number;
        };
        Insert: {
          code: Database["public"]["Enums"]["plan_code"];
          name: string;
          price_tnd?: number;
          max_brands: number;
          max_social_accounts: number;
          max_members: number;
          posts_per_month: number;
          images_per_month: number;
        };
        Update: {
          code?: Database["public"]["Enums"]["plan_code"];
          name?: string;
          price_tnd?: number;
          max_brands?: number;
          max_social_accounts?: number;
          max_members?: number;
          posts_per_month?: number;
          images_per_month?: number;
        };
        Relationships: [
        ];
      };
      post_media: {
        Row: {
          post_id: string;
          media_asset_id: string;
          organization_id: string;
          position: number;
          created_at: string;
        };
        Insert: {
          post_id: string;
          media_asset_id: string;
          organization_id: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          post_id?: string;
          media_asset_id?: string;
          organization_id?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "post_media_media_asset_id_organization_id_fkey"; columns: ["media_asset_id","organization_id"]; isOneToOne: false; referencedRelation: "media_assets"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "post_media_post_id_organization_id_fkey"; columns: ["post_id","organization_id"]; isOneToOne: false; referencedRelation: "posts"; referencedColumns: ["id","organization_id"] },
        ];
      };
      post_variants: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          post_id: string;
          network: string;
          option_index: number;
          is_selected: boolean;
          caption: string;
          hashtags: string[];
          cta: string;
          format: string;
          visual_brief: string;
          compliance_score: number | null;
          compliance_issues: Json;
          edited_by_user: boolean;
          ai_generation_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          post_id: string;
          network: string;
          option_index?: number;
          is_selected?: boolean;
          caption?: string;
          hashtags?: string[];
          cta?: string;
          format?: string;
          visual_brief?: string;
          compliance_score?: number | null;
          compliance_issues?: Json;
          edited_by_user?: boolean;
          ai_generation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          post_id?: string;
          network?: string;
          option_index?: number;
          is_selected?: boolean;
          caption?: string;
          hashtags?: string[];
          cta?: string;
          format?: string;
          visual_brief?: string;
          compliance_score?: number | null;
          compliance_issues?: Json;
          edited_by_user?: boolean;
          ai_generation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "post_variants_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "post_variants_post_id_organization_id_fkey"; columns: ["post_id","organization_id"]; isOneToOne: false; referencedRelation: "posts"; referencedColumns: ["id","organization_id"] },
        ];
      };
      posts: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          idea_id: string | null;
          pillar: string | null;
          idea: string;
          brief: string;
          language: string;
          status: Database["public"]["Enums"]["post_status"];
          scheduled_at: string | null;
          sensitive_topics: string[];
          brand_profile_version: number | null;
          ai_generation_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          idea_id?: string | null;
          pillar?: string | null;
          idea?: string;
          brief?: string;
          language?: string;
          status?: Database["public"]["Enums"]["post_status"];
          scheduled_at?: string | null;
          sensitive_topics?: string[];
          brand_profile_version?: number | null;
          ai_generation_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          idea_id?: string | null;
          pillar?: string | null;
          idea?: string;
          brief?: string;
          language?: string;
          status?: Database["public"]["Enums"]["post_status"];
          scheduled_at?: string | null;
          sensitive_topics?: string[];
          brand_profile_version?: number | null;
          ai_generation_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "posts_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "posts_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "posts_idea_id_organization_id_fkey"; columns: ["idea_id","organization_id"]; isOneToOne: false; referencedRelation: "calendar_ideas"; referencedColumns: ["id","organization_id"] },
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          locale: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      publication_jobs: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          social_account_id: string | null;
          post_variant_id: string | null;
          status: Database["public"]["Enums"]["job_status"];
          run_at: string;
          attempts: number;
          idempotency_key: string;
          caption: string;
          media_paths: string[];
          external_post_id: string | null;
          external_url: string | null;
          last_error: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          social_account_id?: string | null;
          post_variant_id?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          run_at?: string;
          attempts?: number;
          idempotency_key: string;
          caption?: string;
          media_paths?: string[];
          external_post_id?: string | null;
          external_url?: string | null;
          last_error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          social_account_id?: string | null;
          post_variant_id?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          run_at?: string;
          attempts?: number;
          idempotency_key?: string;
          caption?: string;
          media_paths?: string[];
          external_post_id?: string | null;
          external_url?: string | null;
          last_error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "publication_jobs_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "publication_jobs_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "publication_jobs_post_variant_id_organization_id_fkey"; columns: ["post_variant_id","organization_id"]; isOneToOne: false; referencedRelation: "post_variants"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "publication_jobs_social_account_id_organization_id_fkey"; columns: ["social_account_id","organization_id"]; isOneToOne: false; referencedRelation: "social_accounts"; referencedColumns: ["id","organization_id"] },
        ];
      };
      rate_limits: {
        Row: {
          key: string;
          window_start: string;
          hits: number;
        };
        Insert: {
          key: string;
          window_start: string;
          hits?: number;
        };
        Update: {
          key?: string;
          window_start?: string;
          hits?: number;
        };
        Relationships: [
        ];
      };
      social_account_secrets: {
        Row: {
          account_id: string;
          organization_id: string;
          kind: string;
          secret_id: string;
          created_at: string;
        };
        Insert: {
          account_id: string;
          organization_id: string;
          kind: string;
          secret_id: string;
          created_at?: string;
        };
        Update: {
          account_id?: string;
          organization_id?: string;
          kind?: string;
          secret_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "social_account_secrets_account_id_fkey"; columns: ["account_id"]; isOneToOne: false; referencedRelation: "social_accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "social_account_secrets_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
        ];
      };
      social_accounts: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          network: string;
          external_id: string;
          provider_user_id: string | null;
          display_name: string;
          username: string | null;
          avatar_url: string | null;
          status: Database["public"]["Enums"]["social_status"];
          token_expires_at: string | null;
          scopes: string[];
          is_test: boolean;
          is_sandbox: boolean;
          last_checked_at: string | null;
          last_error: string | null;
          connected_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          network: string;
          external_id: string;
          provider_user_id?: string | null;
          display_name: string;
          username?: string | null;
          avatar_url?: string | null;
          status?: Database["public"]["Enums"]["social_status"];
          token_expires_at?: string | null;
          scopes?: string[];
          is_test?: boolean;
          is_sandbox?: boolean;
          last_checked_at?: string | null;
          last_error?: string | null;
          connected_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          network?: string;
          external_id?: string;
          provider_user_id?: string | null;
          display_name?: string;
          username?: string | null;
          avatar_url?: string | null;
          status?: Database["public"]["Enums"]["social_status"];
          token_expires_at?: string | null;
          scopes?: string[];
          is_test?: boolean;
          is_sandbox?: boolean;
          last_checked_at?: string | null;
          last_error?: string | null;
          connected_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "social_accounts_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "social_accounts_connected_by_fkey"; columns: ["connected_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      social_oauth_sessions: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          user_id: string;
          provider: string;
          candidates: Json;
          secret_id: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          user_id: string;
          provider: string;
          candidates?: Json;
          secret_id?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          user_id?: string;
          provider?: string;
          candidates?: Json;
          secret_id?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "social_oauth_sessions_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "social_oauth_sessions_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "social_oauth_sessions_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      strategies: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          period: string;
          summary: string;
          objectives: Json;
          pillars: Json;
          tone: string;
          frequency: Json;
          format_mix: Json;
          status: Database["public"]["Enums"]["strategy_status"];
          brand_profile_version: number | null;
          ai_generation_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          period: string;
          summary?: string;
          objectives?: Json;
          pillars?: Json;
          tone?: string;
          frequency?: Json;
          format_mix?: Json;
          status?: Database["public"]["Enums"]["strategy_status"];
          brand_profile_version?: number | null;
          ai_generation_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          period?: string;
          summary?: string;
          objectives?: Json;
          pillars?: Json;
          tone?: string;
          frequency?: Json;
          format_mix?: Json;
          status?: Database["public"]["Enums"]["strategy_status"];
          brand_profile_version?: number | null;
          ai_generation_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "strategies_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "strategies_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      usage_counters: {
        Row: {
          organization_id: string;
          period: string;
          posts_generated: number;
          images_generated: number;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          period: string;
          posts_generated?: number;
          images_generated?: number;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          period?: string;
          posts_generated?: number;
          images_generated?: number;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "usage_counters_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
        ];
      };
      visual_projects: {
        Row: {
          id: string;
          organization_id: string;
          brand_id: string;
          post_id: string | null;
          name: string;
          kind: string;
          template_id: string;
          format: string;
          slides: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brand_id: string;
          post_id?: string | null;
          name?: string;
          kind?: string;
          template_id: string;
          format?: string;
          slides?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brand_id?: string;
          post_id?: string | null;
          name?: string;
          kind?: string;
          template_id?: string;
          format?: string;
          slides?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "visual_projects_brand_id_organization_id_fkey"; columns: ["brand_id","organization_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id","organization_id"] },
          { foreignKeyName: "visual_projects_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "visual_projects_post_id_organization_id_fkey"; columns: ["post_id","organization_id"]; isOneToOne: false; referencedRelation: "posts"; referencedColumns: ["id","organization_id"] },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      can_edit: { Args: { p_org: string }; Returns: boolean };
      can_manage: { Args: { p_org: string }; Returns: boolean };
      check_rate_limit: { Args: { p_key: string; p_limit: number; p_window_seconds: number }; Returns: boolean };
      consume_quota: { Args: { p_org: string; p_kind: string; p_amount?: number }; Returns: { used: number; quota: number }[] };
      get_invitation_preview: { Args: { p_token: string }; Returns: { organization_name: string; role: Database["public"]["Enums"]["org_role"]; email: string; is_expired: boolean; is_used: boolean }[] };
      has_org_role: { Args: { p_org: string; p_roles: Database["public"]["Enums"]["org_role"][] }; Returns: boolean };
      is_org_owner: { Args: { p_org: string }; Returns: boolean };
      match_knowledge: { Args: { p_brand: string; p_query_embedding: string; p_query_text: string; p_limit?: number }; Returns: { chunk_id: string; document_id: string; document_title: string; content: string; score: number }[] };
      path_org_id: { Args: { p_path: string }; Returns: string };
      refund_quota: { Args: { p_org: string; p_kind: string; p_amount?: number }; Returns: undefined };
      user_org_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      vault_delete: { Args: { p_id: string }; Returns: undefined };
      vault_put: { Args: { p_name: string; p_value: string }; Returns: string };
      vault_read: { Args: { p_id: string }; Returns: string };
      vault_replace: { Args: { p_id: string; p_value: string }; Returns: undefined };
    };
    Enums: {
      autopilot_mode: "manual" | "semi_auto" | "auto";
      document_status: "pending" | "processing" | "ready" | "failed";
      idea_status: "idea" | "drafted" | "skipped";
      job_status: "queued" | "running" | "succeeded" | "failed";
      org_role: "owner" | "admin" | "editor" | "validator" | "viewer";
      plan_code: "trial" | "starter" | "pro" | "agency";
      post_status: "draft" | "in_review" | "approved" | "scheduled" | "publishing" | "published" | "failed";
      social_status: "active" | "expiring" | "expired" | "error";
      strategy_status: "draft" | "active" | "archived";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
