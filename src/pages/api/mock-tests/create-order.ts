import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

/*
=========================================================
HABITAT IAS
JPSC MOCK TEST SERIES — CREATE RAZORPAY ORDER
=========================================================

PRODUCT:
JPSC Prelims 20-Test Mock Test Series

PRICE:
₹499

IMPORTANT:
The browser NEVER decides the price.

The server always creates the Razorpay order for:
₹499 = 49900 paise
=========================================================
*/


/*
=========================================================
ENVIRONMENT VARIABLES
=========================================================
*/

const RAZORPAY_KEY_ID =
  import.meta.env.RAZORPAY_KEY_ID;

const RAZORPAY_KEY_SECRET =
  import.meta.env.RAZORPAY_KEY_SECRET;

const SUPABASE_URL =
  import.meta.env.PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY;


/*
=========================================================
SUPABASE SERVER CLIENT
=========================================================
*/

const supabase =
  SUPABASE_URL &&
  SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      )
    : null;


/*
=========================================================
JSON RESPONSE HELPER
=========================================================
*/

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
          "no-store",
      },
    }
  );
}


/*
=========================================================
GET AUTHENTICATED USER
=========================================================

The browser sends:

Authorization: Bearer <supabase_access_token>

We verify that token through Supabase Auth.

The user's UUID is then used for purchases.user_id.
=========================================================
*/

async function getAuthenticatedUser(
  request: Request
) {
  const authorization =
    request.headers.get(
      "Authorization"
    );

  if (
    !authorization ||
    !authorization
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    return null;
  }

  const accessToken =
    authorization
      .slice(7)
      .trim();

  if (!accessToken) {
    return null;
  }

  /*
   * Use a separate client with the
   * user's access token.
   */
  const userClient =
    SUPABASE_URL
      ? createClient(
          SUPABASE_URL,
          import.meta.env
            .PUBLIC_SUPABASE_ANON_KEY,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
            global: {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
            },
          }
        )
      : null;

  if (!userClient) {
    return null;
  }

  const {
    data,
    error,
  } =
    await userClient.auth.getUser(
      accessToken
    );

  if (
    error ||
    !data?.user
  ) {
    console.error(
      "[MOCK PAYMENT] Auth verification failed:",
      error
    );

    return null;
  }

  return data.user;
}


/*
=========================================================
POST
=========================================================
*/

export const POST: APIRoute =
  async ({ request }) => {

    try {

      /*
      ---------------------------------------------------
      1. SERVER CONFIGURATION
      ---------------------------------------------------
      */

      if (
        !RAZORPAY_KEY_ID ||
        !RAZORPAY_KEY_SECRET
      ) {

        console.error(
          "[MOCK PAYMENT] Razorpay configuration missing."
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Razorpay is not configured on the server.",
          },
          500
        );
      }


      if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY ||
        !supabase
      ) {

        console.error(
          "[MOCK PAYMENT] Supabase configuration missing."
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Database is not configured on the server.",
          },
          500
        );
      }


      /*
      ---------------------------------------------------
      2. AUTHENTICATION
      ---------------------------------------------------
      */

      const user =
        await getAuthenticatedUser(
          request
        );

      if (!user) {

        return jsonResponse(
          {
            success: false,
            error:
              "Please login before purchasing the mock test series.",
            code:
              "LOGIN_REQUIRED",
          },
          401
        );
      }


      const userId =
        user.id;


      /*
      ---------------------------------------------------
      3. READ REQUEST
      ---------------------------------------------------
      */

      let body: any = {};

      try {
        body =
          await request.json();
      } catch {
        body = {};
      }


      /*
      ---------------------------------------------------
      4. TEST NUMBER
      ---------------------------------------------------

      The checkout page can send test=1.

      But this purchase unlocks the COMPLETE
      20-test series, not only Test 1.

      Therefore test number is informational.
      ---------------------------------------------------
      */

      const testNumber =
        Number(
          body?.testNumber ??
          1
        );


      /*
      ---------------------------------------------------
      5. FIXED SERVER-SIDE PRODUCT
      ---------------------------------------------------
      */

      const PRODUCT_ID =
        "jpsc_prelims_20_test_series";

      const PRODUCT_NAME =
        "Habitat IAS — JPSC Prelims 20-Test Mock Test Series";

      const PRICE_RUPEES =
        499;

      const PRICE_PAISE =
        PRICE_RUPEES * 100;

      const CURRENCY =
        "INR";


      /*
      ---------------------------------------------------
      6. CHECK EXISTING PAID PURCHASE
      ---------------------------------------------------

      Prevent unnecessary duplicate purchases.
      ---------------------------------------------------
      */

      const {
        data: existingPurchase,
        error:
          existingPurchaseError,
      } =
        await supabase
          .from("purchases")
          .select(
            "id, payment_status, product_id"
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


      if (
        existingPurchaseError
      ) {

        console.error(
          "[MOCK PAYMENT] Existing purchase lookup failed:",
          existingPurchaseError
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to verify your existing purchase.",
          },
          500
        );
      }


      if (
        existingPurchase
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "You already have access to the JPSC Mock Test Series.",
            code:
              "ALREADY_PURCHASED",
          },
          409
        );
      }


      /*
      ---------------------------------------------------
      7. CREATE RAZORPAY ORDER
      ---------------------------------------------------
      */

      const credentials =
        `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`;

      const authHeader =
        `Basic ${Buffer
          .from(credentials)
          .toString("base64")}`;


      const razorpayResponse =
        await fetch(
          "https://api.razorpay.com/v1/orders",
          {
            method: "POST",

            headers: {
              Authorization:
                authHeader,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                amount:
                  PRICE_PAISE,

                currency:
                  CURRENCY,

                receipt:
                  `JPSC-MOCK-${userId.slice(0, 8)}-${Date.now()}`,

                notes: {
                  product_id:
                    PRODUCT_ID,

                  test_number:
                    String(
                      Number.isInteger(
                        testNumber
                      )
                        ? testNumber
                        : 1
                    ),

                  user_id:
                    userId,
                },
              }),
          }
        );


      let razorpayData:
        any = null;

      try {

        razorpayData =
          await razorpayResponse.json();

      } catch {

        console.error(
          "[MOCK PAYMENT] Razorpay returned invalid JSON."
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Razorpay returned an invalid response.",
          },
          502
        );
      }


      /*
      ---------------------------------------------------
      8. HANDLE RAZORPAY FAILURE
      ---------------------------------------------------
      */

      if (
        !razorpayResponse.ok
      ) {

        console.error(
          "[MOCK PAYMENT] Razorpay order creation failed:",
          razorpayData
        );

        return jsonResponse(
          {
            success: false,
            error:
              razorpayData?.error
                ?.description ||
              razorpayData?.error
                ?.reason ||
              "Unable to create Razorpay order.",
          },
          502
        );
      }


      /*
      ---------------------------------------------------
      9. VALIDATE RAZORPAY ORDER
      ---------------------------------------------------
      */

      if (
        !razorpayData?.id
      ) {

        console.error(
          "[MOCK PAYMENT] Razorpay order ID missing:",
          razorpayData
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Razorpay order ID was not returned.",
          },
          502
        );
      }


      /*
      ---------------------------------------------------
      10. CREATE PENDING PURCHASE
      ---------------------------------------------------

      IMPORTANT:

      purchases.amount is stored in RUPEES.

      Razorpay amount is stored in PAISE.

      Therefore:

      purchases.amount = 499
      Razorpay amount   = 49900
      ---------------------------------------------------
      */

      const {
        data: purchase,
        error:
          purchaseError,
      } =
        await supabase
          .from("purchases")
          .insert({
            user_id:
              userId,

            product_id:
              PRODUCT_ID,

            product_name:
              PRODUCT_NAME,

            amount:
              PRICE_RUPEES,

            currency:
              CURRENCY,

            payment_status:
              "pending",

            payment_gateway:
              "razorpay",

            order_id:
              razorpayData.id,
          })
          .select(
            "id, user_id, product_id, amount, currency, payment_status, order_id"
          )
          .single();


      /*
      ---------------------------------------------------
      11. HANDLE DATABASE FAILURE
      ---------------------------------------------------
      */

      if (
        purchaseError ||
        !purchase
      ) {

        console.error(
          "[MOCK PAYMENT] Purchase creation failed:",
          purchaseError
        );

        /*
         * IMPORTANT:
         *
         * A Razorpay order has already been created.
         *
         * We do NOT pretend the order failed.
         *
         * The order can simply remain unused.
         */

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to create the payment record. Please try again.",
          },
          500
        );
      }


      /*
      ---------------------------------------------------
      12. SUCCESS
      ---------------------------------------------------
      */

      return jsonResponse(
        {
          success: true,

          keyId:
            RAZORPAY_KEY_ID,

          order: {
            id:
              razorpayData.id,

            amount:
              Number(
                razorpayData.amount
              ),

            currency:
              razorpayData.currency ||
              CURRENCY,
          },

          product: {
            id:
              PRODUCT_ID,

            name:
              PRODUCT_NAME,

            amount:
              PRICE_RUPEES,

            currency:
              CURRENCY,
          },

          purchaseId:
            purchase.id,

          userId:
            userId,
        }
      );

    } catch (error) {

      console.error(
        "[MOCK PAYMENT] Unexpected create-order error:",
        error
      );

      return jsonResponse(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unexpected server error.",
        },
        500
      );
    }
  };