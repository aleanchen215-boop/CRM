import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function createContext() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const user = authUser
    ? await prisma.user.findUnique({ where: { authId: authUser.id } })
    : null;

  return { prisma, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
