import type { Database } from './types/supabase';

export type { Database, Json } from './types/supabase';
export * from './enums';

// ===== Helpers de tipos basados en Database =====

type PublicSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
