import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { RsoConsoleShell } from '@/components/industry/RsoConsoleShell';
import { Profile } from '@/types/database';

/**
 * Puerta de Entrada Principal a la Consola RSO (Server Component).
 *
 * Valida de forma estricta que exista una sesión activa en Supabase Auth.
 * Si no hay sesión válida, redirige inmediatamente a /login.
 * Si la sesión es válida, carga el perfil del usuario para scoped RBAC y renderiza la consola.
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organization:organizations(*)')
    .eq('id', user.id)
    .maybeSingle();

  return <RsoConsoleShell user={user} profile={profile as Profile | null} />;
}
