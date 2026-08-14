import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

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
   SUPABASE ADMIN CLIENT
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
          "private, no-store",

        "Vary":
          "Authorization",
      },
    }
  );
}

/* =========================================================
   GET BEARER TOKEN
========================================================= */

function getAccessToken(
  request: Request
): string | null {

  const authorization =
    request.headers.get(
      "Authorization"
    );

  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  const token =
    authorization
      .slice(7)
      .trim();

  return token || null;
}

/* =========================================================
   BUILD 20-TEST ACCESS MAP
========================================================= */

function buildAccessMap(
  allowed: boolean
) {

  const tests:
    Record<string, boolean> = {};

  for (
    let testNumber = 1;
    testNumber <= TOTAL_TESTS;
    testNumber++
  ) {

    tests[
      String(testNumber)
    ] = allowed;
  }

  return tests;
}

/* =========================================================
   GET
   /api/mock-tests/access

   ACCESS RULE:

   1. Paid purchase = access
   2. Manual admin access = access
   3. Neither = locked

   One valid access source unlocks ALL 20 tests.
========================================================= */

export const GET: APIRoute =
  async ({ request }) => {

    try {

      /* =====================================================
         1. GET ACCESS TOKEN
      ===================================================== */

      const accessToken =
        getAccessToken(
          request
        );

      /*
       * Not logged in.
       */

      if (!accessToken) {

        return jsonResponse(
          {
            success: true,

            loggedIn: false,

            paid: false,

            manualAccess: false,

            hasAccess: false,

            userId: null,

            productId:
              PRODUCT_ID,

            tests:
              buildAccessMap(
                false
              ),
          }
        );
      }


      /* =====================================================
         2. VERIFY USER WITH SUPABASE
      ===================================================== */

      const {
        data: userData,
        error: userError,
      } =
        await supabaseAdmin
          .auth
          .getUser(
            accessToken
          );


      if (
        userError ||
        !userData?.user
      ) {

        console.error(
          "Mock access user verification failed:",
          userError
        );

        return jsonResponse(
          {
            success: true,

            loggedIn: false,

            paid: false,

            manualAccess: false,

            hasAccess: false,

            userId: null,

            productId:
              PRODUCT_ID,

            tests:
              buildAccessMap(
                false
              ),
          }
        );
      }


      const userId =
        userData.user.id;


      /* =====================================================
         3. CHECK PAID PURCHASE

         Existing payment system remains unchanged.

         ONE PAID PURCHASE UNLOCKS ALL 20 TESTS.
      ===================================================== */

      const {
        data: purchase,
        error: purchaseError,
      } =
        await supabaseAdmin
          .from("purchases")
          .select(
            "id, user_id, product_id, payment_status"
          )
          .eq(
            "user_id",
            userId
          )
          .eq(
            "product_id",
            PRODUCT_ID
          )
          .eq(
            "payment_status",
            "paid"
          )
          .limit(1)
          .maybeSingle();


      /* =====================================================
         4. CHECK MANUAL ADMIN ACCESS

         This is separate from purchases.

         We NEVER modify the purchase/payment record
         when an administrator manually grants access.
      ===================================================== */

      const {
        data: manualAccess,
        error: manualAccessError,
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


      /* =====================================================
         5. DATABASE ERROR
      ===================================================== */

      if (purchaseError) {

        console.error(
          "Mock purchase lookup failed:",
          purchaseError
        );

        return jsonResponse(
          {
            success: false,

            loggedIn: true,

            paid: false,

            manualAccess:
              Boolean(
                manualAccess
              ),

            hasAccess:
              Boolean(
                manualAccess
              ),

            userId,

            productId:
              PRODUCT_ID,

            tests:
              buildAccessMap(
                Boolean(
                  manualAccess
                )
              ),

            message:
              "Unable to verify mock-test purchase.",
          },

          500
        );
      }


      if (manualAccessError) {

        console.error(
          "Manual mock-test access lookup failed:",
          manualAccessError
        );

        return jsonResponse(
          {
            success: false,

            loggedIn: true,

            paid:
              Boolean(
                purchase
              ),

            manualAccess: false,

            hasAccess:
              Boolean(
                purchase
              ),

            userId,

            productId:
              PRODUCT_ID,

            tests:
              buildAccessMap(
                Boolean(
                  purchase
                )
              ),

            message:
              "Unable to verify manual mock-test access.",
          },

          500
        );
      }


      /* =====================================================
         6. DETERMINE ACCESS

         IMPORTANT:

         Paid OR manual access = unlocked.

         Therefore:

         - Paid + manual      = unlocked
         - Paid only          = unlocked
         - Manual only        = unlocked
         - Neither            = locked

         Revoking manual access from a paid student
         DOES NOT remove their paid access.
      ===================================================== */

      const paid =
        Boolean(
          purchase
        );

      const hasManualAccess =
        Boolean(
          manualAccess
        );

      const hasAccess =
        paid ||
        hasManualAccess;


      /* =====================================================
         7. BUILD ACCESS MAP
      ===================================================== */

      const accessMap =
        buildAccessMap(
          hasAccess
        );


      /* =====================================================
         8. RETURN ACCESS
      ===================================================== */

      return jsonResponse(
        {
          success: true,

          loggedIn: true,

          paid,

          manualAccess:
            hasManualAccess,

          hasAccess,

          userId,

          productId:
            PRODUCT_ID,

          purchaseId:
            purchase?.id ??
            null,

          manualAccessId:
            manualAccess?.id ??
            null,

          tests:
            accessMap,
        }
      );


    } catch (error) {

      /* =====================================================
         UNEXPECTED ERROR
      ===================================================== */

      console.error(
        "Mock-test access API unexpected error:",
        error
      );


      return jsonResponse(
        {
          success: false,

          loggedIn: false,

          paid: false,

          manualAccess: false,

          hasAccess: false,

          userId: null,

          productId:
            PRODUCT_ID,

          tests:
            buildAccessMap(
              false
            ),

          message:
            "Unable to verify mock-test access.",
        },

        500
      );
    }
  };