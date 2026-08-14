import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const adminUserId = import.meta.env.ADMIN_USER_ID;

if (!supabaseUrl) {
  throw new Error("PUBLIC_SUPABASE_URL is missing.");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
}

if (!adminUserId) {
  throw new Error("ADMIN_USER_ID is missing.");
}

/*
 * SERVER-ONLY Supabase client.
 *
 * The service-role key is NEVER sent to the browser.
 */
const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function jsonResponse(
  data: Record<string, unknown>,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}

export const GET: APIRoute = async ({ cookies }) => {
  try {
    /*
     * Get the authenticated student's/admin's
     * server-side session cookie.
     */
    const accessToken =
      cookies.get("habitat-access-token")?.value;

    /*
     * No session.
     */
    if (!accessToken) {
      return jsonResponse(
        {
          success: false,
          isAuthenticated: false,
          isAdmin: false,
          message: "Authentication required.",
        },
        401
      );
    }

    /*
     * Validate the Supabase access token.
     */
    const {
      data,
      error,
    } = await supabaseAdmin.auth.getUser(
      accessToken
    );

    /*
     * Invalid / expired session.
     */
    if (error || !data?.user) {
      return jsonResponse(
        {
          success: false,
          isAuthenticated: false,
          isAdmin: false,
          message: "Invalid or expired session.",
        },
        401
      );
    }

    /*
     * Authenticated Supabase user ID.
     */
    const userId = data.user.id;

    /*
     * IMPORTANT:
     *
     * The actual ADMIN_USER_ID remains on the server
     * inside .env.
     *
     * We only compare it here.
     */
    const isAdmin = userId === adminUserId;

    /*
     * Authenticated but not an administrator.
     */
    if (!isAdmin) {
      return jsonResponse(
        {
          success: true,
          isAuthenticated: true,
          isAdmin: false,
          message: "Admin access denied.",
        },
        403
      );
    }

    /*
     * ADMIN AUTHORIZED.
     *
     * Deliberately do NOT return:
     * - ADMIN_USER_ID
     * - service-role key
     * - access token
     * - email
     * - private environment variables
     */
    return jsonResponse({
      success: true,
      isAuthenticated: true,
      isAdmin: true,
      message: "Admin authorization successful.",
    });
  } catch (error) {
    console.error(
      "Admin authorization error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        isAuthenticated: false,
        isAdmin: false,
        message: "Unable to verify admin authorization.",
      },
      500
    );
  }
};