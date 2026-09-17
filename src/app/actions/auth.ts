'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/**
 * Autentica al usuario mediante email corporativo y contraseña contra Supabase Auth.
 * Redirige a '/' en caso de éxito o a '/login?error=...' en caso de fallo.
 */
export async function login(formData: FormData) {
  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return redirect('/login?error=' + encodeURIComponent('Introduce email corporativo y contraseña.'));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return redirect('/login?error=' + encodeURIComponent(error.message));
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

/**
 * Cierra la sesión activa del usuario y revoca la cookie de sesión.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
