"use server";

import { createSupabaseServerClient } from "../lib/supabase-server";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });
  if (error) {
    redirect("/login?error=invalid");
  }
  redirect("/");
}
