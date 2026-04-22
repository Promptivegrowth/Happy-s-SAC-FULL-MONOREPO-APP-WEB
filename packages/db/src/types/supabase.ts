/**
 * Tipos generados desde Supabase. Este archivo es un placeholder mínimo.
 *
 * Para regenerar con los tipos reales después de aplicar migraciones:
 *
 *   pnpm db:types
 *   # equivalente a:
 *   # supabase gen types typescript --project-id trkokphwmkedhxwjriod > packages/db/src/types/supabase.ts
 *
 * No editar a mano salvo cuando se ejecute db:types — se sobreescribe.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: [];
    }>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
