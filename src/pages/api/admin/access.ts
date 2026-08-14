import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import {
  requireAdmin,
} from "../../../lib/admin-auth";

export const prerender = false;

/* =========================================================
   ENVIRONMENT
========================================================= */

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

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

/* =========================================================
   CONSTANTS
========================================================= */

const PRODUCT_ID =
  "jpsc_prelims_20_test_series";

const TOTAL_TESTS = 20;

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
   JSON RESPONSE
========================================================= */

function jsonResponse(
  data: Record<string, unknown>,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store, no-cache, must-revalidate",

        Pragma:
          "no-cache",
      },
    }
  );
}

/* =========================================================
   VALIDATE UUID
========================================================= */

function isValidUuid(
  value: unknown
): value is string {

  if (
    typeof value !== "string"
  ) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/* =========================================================
   GET
   CHECK MANUAL ACCESS FOR ONE STUDENT
========================================================= */

export const GET: APIRoute =
  async ({
    request,
    cookies,
  }) => {

    try {

      /* =====================================================
         1. CENTRAL ADMIN AUTHORIZATION
      ===================================================== */

      const auth =
        await requireAdmin(
          request,
          cookies
        );

      if (
        !auth.authorized
      ) {

        return jsonResponse(
          {
            success: false,

            isAuthenticated:
              auth.authenticated,

            isAdmin: false,

            message:
              auth.message,
          },

          auth.authenticated
            ? 403
            : 401
        );
      }

      /* =====================================================
         2. GET USER ID
      ===================================================== */

      const url =
        new URL(
          request.url
        );

      const userId =
        url.searchParams.get(
          "user_id"
        );

      if (
        !isValidUuid(
          userId
        )
      ) {

        return jsonResponse(
          {
            success: false,

            message:
              "A valid user_id is required.",
          },

          400
        );
      }

      /* =====================================================
         3. CHECK MANUAL ACCESS
      ===================================================== */

      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from(
            "manual_series_access"
          )
          .select(
            "id, user_id, product_id, granted_by, granted_at, updated_at"
          )
          .eq(
            "user_id",
            userId
          )
          .eq(
            "product_id",
            PRODUCT_ID
          )
          .maybeSingle();

      if (error) {

        console.error(
          "Manual access lookup error:",
          error
        );

        return jsonResponse(
          {
            success: false,

            message:
              "Unable to check manual access.",
          },

          500
        );
      }

      /* =====================================================
         4. RETURN ACCESS STATUS
      ===================================================== */

      return jsonResponse({
        success: true,

        hasManualAccess:
          Boolean(data),

        productId:
          PRODUCT_ID,

        totalTests:
          TOTAL_TESTS,

        access:
          data ?? null,
      });

    } catch (error) {

      console.error(
        "Admin access GET error:",
        error
      );

      return jsonResponse(
        {
          success: false,

          message:
            "Unable to process access request.",
        },

        500
      );
    }
  };

/* =========================================================
   POST
   GRANT MANUAL ACCESS
========================================================= */

export const POST: APIRoute =
  async ({
    request,
    cookies,
  }) => {

    try {

      /* =====================================================
         1. CENTRAL ADMIN AUTHORIZATION
      ===================================================== */

      const auth =
        await requireAdmin(
          request,
          cookies
        );

      if (
        !auth.authorized
      ) {

        return jsonResponse(
          {
            success: false,

            isAuthenticated:
              auth.authenticated,

            isAdmin: false,

            message:
              auth.message,
          },

          auth.authenticated
            ? 403
            : 401
        );
      }

      /* =====================================================
         2. READ REQUEST BODY
      ===================================================== */

      let body: unknown;

      try {

        body =
          await request.json();

      } catch {

        return jsonResponse(
          {
            success: false,

            message:
              "Invalid JSON request body.",
          },

          400
        );
      }

      if (
        typeof body !== "object" ||
        body === null
      ) {

        return jsonResponse(
          {
            success: false,

            message:
              "Invalid request body.",
          },

          400
        );
      }

      const payload =
        body as Record<
          string,
          unknown
        >;

      const userId =
        payload.user_id;

      /* =====================================================
         3. VALIDATE TARGET USER
      ===================================================== */

      if (
        !isValidUuid(
          userId
        )
      ) {

        return jsonResponse(
          {
            success: false,

            message:
              "A valid user_id is required.",
          },

          400
        );
      }

      /*
       * IMPORTANT:
       *
       * The browser cannot choose an arbitrary product.
       *
       * This endpoint only manages:
       *
       * jpsc_prelims_20_test_series
       */

      /* =====================================================
         4. VERIFY TARGET USER EXISTS
      ===================================================== */

      const {
        data: targetData,
        error: targetError,
      } =
        await supabaseAdmin
          .auth
          .admin
          .getUserById(
            userId
          );

      if (
        targetError ||
        !targetData?.user
      ) {

        return jsonResponse(
          {
            success: false,

            message:
              "Student account was not found.",
          },

          404
        );
      }

      /* =====================================================
         5. GRANT MANUAL ACCESS
      ===================================================== */

      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from(
            "manual_series_access"
          )
          .upsert(
            {
              user_id:
                userId,

              product_id:
                PRODUCT_ID,

              granted_by:
                auth.userId,

              granted_at:
                new Date().toISOString(),

              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                "user_id,product_id",
            }
          )
          .select(
            "id, user_id, product_id, granted_by, granted_at, updated_at"
          )
          .single();

      if (error) {

        console.error(
          "Grant manual access error:",
          error
        );

        return jsonResponse(
          {
            success: false,

            message:
              "Unable to grant manual access.",
          },

          500
        );
      }

      /* =====================================================
         6. SUCCESS
      ===================================================== */

      return jsonResponse({
        success: true,

        action:
          "granted",

        message:
          "Manual access granted successfully.",

        productId:
          PRODUCT_ID,

        totalTests:
          TOTAL_TESTS,

        access:
          data,
      });

    } catch (error) {

      console.error(
        "Admin access POST error:",
        error
      );

      return jsonResponse(
        {
          success: false,

          message:
            "Unable to grant manual access.",
        },

        500
      );
    }
  };

/* =========================================================
   DELETE
   REVOKE MANUAL ACCESS
========================================================= */

export const DELETE: APIRoute =
  async ({
    request,
    cookies,
  }) => {

    try {

      /* =====================================================
         1. CENTRAL ADMIN AUTHORIZATION
      ===================================================== */

      const auth =
        await requireAdmin(
          request,
          cookies
        );

      if (
        !auth.authorized
      ) {

        return jsonResponse(
          {
            success: false,

            isAuthenticated:
              auth.authenticated,

            isAdmin: false,

            message:
              auth.message,
          },

          auth.authenticated
            ? 403
            : 401
        );
      }

      /* =====================================================
         2. READ REQUEST BODY
      ===================================================== */

      let body: unknown;

      try {

        body =
          await request.json();

      } catch {

        return jsonResponse(
          {
            success: false,

            message:
              "Invalid JSON request body.",
          },

          400
        );
      }

      if (
        typeof body !== "object" ||
        body === null
      ) {

        return jsonResponse(
          {
            success: false,

            message:
              "Invalid request body.",
          },

          400
        );
      }

      const payload =
        body as Record<
          string,
          unknown
        >;

      const userId =
        payload.user_id;

      /* =====================================================
         3. VALIDATE USER ID
      ===================================================== */

      if (
        !isValidUuid(
          userId
        )
      ) {

        return jsonResponse(
          {
            success: false,

            message:
              "A valid user_id is required.",
          },

          400
        );
      }

      /* =====================================================
         4. REVOKE MANUAL ACCESS
      ===================================================== */

      const {
        error,
      } =
        await supabaseAdmin
          .from(
            "manual_series_access"
          )
          .delete()
          .eq(
            "user_id",
            userId
          )
          .eq(
            "product_id",
            PRODUCT_ID
          );

      if (error) {

        console.error(
          "Revoke manual access error:",
          error
        );

        return jsonResponse(
          {
            success: false,

            message:
              "Unable to revoke manual access.",
          },

          500
        );
      }

      /* =====================================================
         5. SUCCESS
      ===================================================== */

      return jsonResponse({
        success: true,

        action:
          "revoked",

        message:
          "Manual access revoked successfully.",

        productId:
          PRODUCT_ID,

        totalTests:
          TOTAL_TESTS,
      });

    } catch (error) {

      console.error(
        "Admin access DELETE error:",
        error
      );

      return jsonResponse(
        {
          success: false,

          message:
            "Unable to revoke manual access.",
        },

        500
      );
    }
  };