// Cursor-only ambient declarations for URL modules and Deno global
// This file is referenced at the top of index.ts via a triple-slash directive
// It is safe in Deno; ignored at runtime.

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export const serve: any;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(url: string, key: string): any;
}

declare module "https://esm.sh/@supabase/supabase-js@2.7.1" {
  export function createClient(url: string, key: string): any;
}

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};



