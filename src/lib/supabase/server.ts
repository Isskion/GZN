import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

export async function createClient(request?: NextRequest) {
  const cookieStore = await cookies();
  const authHeader = request?.headers.get('authorization');

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component context can't set cookies
          }
        },
      },
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    }
  );
}
