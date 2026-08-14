import { createClient } from "@supabase/supabase-js";

/* =========================================================
   SERVER ENVIRONMENT
========================================================= */

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const adminUserId =
  import.meta.env.ADMIN_USER_ID;

if (!supabaseUrl) {
  throw new Error(
    "PUBLIC_SUPABASE_URL is missing."
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is missing."
  );
}

if (!adminUserId) {
  throw new Error(
    "ADMIN_USER_ID is missing."
  );
}


/* =========================================================
   SERVER-ONLY SUPABASE CLIENT
========================================================= */

const supabaseAdmin =
  createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );


/* =========================================================
   ADMIN AUTH RESULT
========================================================= */

export type AdminAuthResult = {

  authenticated: boolean;

  authorized: boolean;

  userId: string | null;

  message: string;

};


/* =========================================================
   CHECK ADMIN AUTHORIZATION
========================================================= */

export async function
requireAdmin(
  request: Request,
  cookies: {
    get: (
      name: string
    ) => {
      value: string;
    } | undefined;
  }
): Promise<AdminAuthResult> {

  try {

    /* =====================================================
       1. GET SESSION TOKEN
    ===================================================== */

    const accessToken =
      cookies
        .get(
          "habitat-access-token"
        )
        ?.value;


    /* =====================================================
       2. NO SESSION
    ===================================================== */

    if (!accessToken) {

      return {

        authenticated: false,

        authorized: false,

        userId: null,

        message:
          "Authentication required.",

      };

    }


    /* =====================================================
       3. VERIFY SUPABASE USER
    ===================================================== */

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .auth
        .getUser(
          accessToken
        );


    /* =====================================================
       4. INVALID / EXPIRED SESSION
    ===================================================== */

    if (
      error ||
      !data?.user
    ) {

      console.error(
        "Admin session verification failed:",
        error
      );

      return {

        authenticated: false,

        authorized: false,

        userId: null,

        message:
          "Invalid or expired session.",

      };

    }


    /* =====================================================
       5. AUTHENTICATED USER
    ===================================================== */

    const userId =
      data.user.id;


    /* =====================================================
       6. ADMIN CHECK
    ===================================================== */

    const authorized =
      userId === adminUserId;


    /* =====================================================
       7. NOT ADMIN
    ===================================================== */

    if (!authorized) {

      return {

        authenticated: true,

        authorized: false,

        userId,

        message:
          "Administrator access denied.",

      };

    }


    /* =====================================================
       8. ADMIN AUTHORIZED
    ===================================================== */

    return {

      authenticated: true,

      authorized: true,

      userId,

      message:
        "Administrator authorization successful.",

    };

  } catch (error) {

    console.error(
      "Admin authorization error:",
      error
    );

    return {

      authenticated: false,

      authorized: false,

      userId: null,

      message:
        "Unable to verify administrator authorization.",

    };

  }

}


/* =========================================================
   JSON RESPONSE HELPERS
========================================================= */

export function
adminUnauthorizedResponse(
  message =
    "Authentication required."
) {

  return new Response(
    JSON.stringify({

      success: false,

      isAuthenticated: false,

      isAdmin: false,

      message,

    }),
    {

      status: 401,

      headers: {

        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store",

      },

    }
  );

}


export function
adminForbiddenResponse(
  message =
    "Administrator access denied."
) {

  return new Response(
    JSON.stringify({

      success: false,

      isAuthenticated: true,

      isAdmin: false,

      message,

    }),
    {

      status: 403,

      headers: {

        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store",

      },

    }
  );

}