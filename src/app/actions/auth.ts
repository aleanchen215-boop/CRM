"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { error: "Completá usuario/email y contraseña." };
  }

  // Cuentas de staff (Cajero, Productor, Vendedor de sucursal...) entran con
  // un username, no con email real — se resuelve acá al email sintético
  // guardado en la tabla users antes de pasárselo a Supabase Auth.
  let email = identifier;
  if (!identifier.includes("@")) {
    const user = await prisma.user.findUnique({ where: { username: identifier.toLowerCase() } });
    if (!user) return { error: "Credenciales inválidas." };
    email = user.email;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Credenciales inválidas." };
  }

  redirect("/");
}

// No usa redirect() acá adentro: esta función se llama directo desde un
// manejador de evento (clic en el menú), no desde un <form action>, y
// redirect() dentro de una Server Action invocada así no navega bien — el
// componente que llama tiene que redirigir con useRouter después de esperar
// esta promesa.
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
