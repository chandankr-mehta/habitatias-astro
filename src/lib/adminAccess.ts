import { supabase } from "./supabase";

const ADMIN_USER_ID = import.meta.env.ADMIN_USER_ID;

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  return user.id === ADMIN_USER_ID;
}

export async function requireAdmin(): Promise<boolean> {
  const allowed = await isAdmin();

  if (!allowed) {
    window.location.href = "/login";
    return false;
  }

  return true;
}