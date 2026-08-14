import type { APIRoute } from "astro";
import {
  createClient,
} from "@supabase/supabase-js";
import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";


/* =========================================================
   HABITAT IAS
   JPSC MOCK TEST SERIES
   RAZORPAY PAYMENT VERIFICATION API

   PRODUCT:
   jpsc_prelims_20_test_series

   PRICE:
   ₹499

   IMPORTANT:
   This API runs on the SERVER.

   It verifies:
   1. Logged-in user
   2. Razorpay signature
   3. Purchase/order ownership
   4. Product ID
   5. Amount
   6. Currency
   7. Razorpay payment status
   8. Payment/order relationship

   Then:
   purchases.payment_status = "paid"
   purchases.payment_id = Razorpay payment ID
   purchases.paid_at = current timestamp
   ========================================================= */


/* =========================================================
   ENVIRONMENT VARIABLES
   ========================================================= */

const SUPABASE_URL =
  import.meta.env.PUBLIC_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const RAZORPAY_KEY_ID =
  import.meta.env.RAZORPAY_KEY_ID;

const RAZORPAY_KEY_SECRET =
  import.meta.env.RAZORPAY_KEY_SECRET;


/* =========================================================
   FIXED PRODUCT CONFIGURATION
   ========================================================= */

const PRODUCT_ID =
  "jpsc_prelims_20_test_series";

const PRODUCT_NAME =
  "Habitat IAS — JPSC Prelims 20-Test Mock Test Series";

const EXPECTED_AMOUNT_RUPEES =
  499;

const EXPECTED_AMOUNT_PAISE =
  EXPECTED_AMOUNT_RUPEES * 100;

const EXPECTED_CURRENCY =
  "INR";


/* =========================================================
   SUPABASE ADMIN CLIENT
   ========================================================= */

const supabase =
  SUPABASE_URL &&
  SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken:
              false,

            persistSession:
              false,

            detectSessionInUrl:
              false,
          },
        }
      )
    : null;


/* =========================================================
   JSON RESPONSE HELPER
   ========================================================= */

function jsonResponse(
  data: unknown,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store, no-cache, must-revalidate",

        Pragma:
          "no-cache",
      },
    }
  );

}


/* =========================================================
   EXTRACT BEARER TOKEN
   ========================================================= */

function getBearerToken(
  request: Request
): string | null {

  const authorization =
    request.headers.get(
      "authorization"
    );

  if (
    !authorization
  ) {
    return null;
  }


  const parts =
    authorization.trim().split(
      /\s+/
    );


  if (
    parts.length !== 2
  ) {
    return null;
  }


  if (
    parts[0].toLowerCase() !==
    "bearer"
  ) {
    return null;
  }


  const token =
    parts[1].trim();


  if (
    !token
  ) {
    return null;
  }


  return token;

}


/* =========================================================
   RAZORPAY SIGNATURE VERIFICATION
   =========================================================

   Razorpay signature:

   HMAC-SHA256(
      razorpay_order_id + "|" + razorpay_payment_id,
      RAZORPAY_KEY_SECRET
   )

   ========================================================= */

function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  receivedSignature: string,
  secret: string
): boolean {

  try {

    const payload =
      `${orderId}|${paymentId}`;


    const expectedSignature =
      createHmac(
        "sha256",
        secret
      )
        .update(payload)
        .digest("hex");


    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        "hex"
      );


    const receivedBuffer =
      Buffer.from(
        receivedSignature,
        "hex"
      );


    /*
     * Length must be equal before
     * timingSafeEqual().
     */

    if (
      expectedBuffer.length !==
      receivedBuffer.length
    ) {

      return false;

    }


    return timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    );

  } catch (
    error
  ) {

    console.error(
      "[MOCK PAYMENT] Signature verification error:",
      error
    );

    return false;

  }

}


/* =========================================================
   POST
   ========================================================= */

export const POST: APIRoute =
  async ({
    request,
  }) => {

    try {


      /* ===================================================
         1. CHECK SERVER CONFIGURATION
         =================================================== */

      if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY
      ) {

        console.error(
          "[MOCK PAYMENT] Supabase server configuration missing."
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Database server configuration is missing.",
          },
          500
        );

      }


      if (
        !supabase
      ) {

        console.error(
          "[MOCK PAYMENT] Supabase admin client could not be created."
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Database connection is not available.",
          },
          500
        );

      }


      if (
        !RAZORPAY_KEY_ID ||
        !RAZORPAY_KEY_SECRET
      ) {

        console.error(
          "[MOCK PAYMENT] Razorpay environment variables missing."
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Razorpay server configuration is missing.",
          },
          500
        );

      }


      /* ===================================================
         2. AUTHENTICATE USER
         =================================================== */

      const accessToken =
        getBearerToken(
          request
        );


      if (
        !accessToken
      ) {

        return jsonResponse(
          {
            success:
              false,

            code:
              "LOGIN_REQUIRED",

            error:
              "Please login before verifying payment.",
          },
          401
        );

      }


      /*
       * IMPORTANT:
       *
       * We do NOT trust user_id sent by the browser.
       *
       * We get the authenticated user directly
       * from Supabase using the Bearer token.
       */

      const {
        data:
          userData,
        error:
          userError,
      } =
        await supabase.auth.getUser(
          accessToken
        );


      if (
        userError ||
        !userData?.user
      ) {

        console.error(
          "[MOCK PAYMENT] Invalid user session:",
          userError
        );

        return jsonResponse(
          {
            success:
              false,

            code:
              "LOGIN_REQUIRED",

            error:
              "Your login session is invalid or expired. Please login again.",
          },
          401
        );

      }


      const user =
        userData.user;


      const userId =
        user.id;


      /* ===================================================
         3. READ REQUEST BODY
         =================================================== */

      let body: any;


      try {

        body =
          await request.json();

      } catch {

        return jsonResponse(
          {
            success:
              false,

            error:
              "Invalid JSON request body.",
          },
          400
        );

      }


      const razorpayPaymentId =
        String(
          body?.razorpay_payment_id ||
          ""
        ).trim();


      const razorpayOrderId =
        String(
          body?.razorpay_order_id ||
          ""
        ).trim();


      const razorpaySignature =
        String(
          body?.razorpay_signature ||
          ""
        ).trim();


      /* ===================================================
         4. BASIC PAYMENT VALIDATION
         =================================================== */

      if (
        !razorpayPaymentId ||
        !razorpayOrderId ||
        !razorpaySignature
      ) {

        return jsonResponse(
          {
            success:
              false,

            error:
              "Incomplete Razorpay payment information.",
          },
          400
        );

      }


      /* ===================================================
         5. FIND PURCHASE
         ===================================================

         VERY IMPORTANT:

         We search by:

         order_id
         AND
         user_id

         Therefore another logged-in user cannot
         submit somebody else's Razorpay order.
         =================================================== */

      const {
        data:
          purchase,
        error:
          purchaseError,
      } =
        await supabase
          .from(
            "purchases"
          )
          .select(
            [
              "id",
              "user_id",
              "product_id",
              "product_name",
              "amount",
              "currency",
              "payment_status",
              "payment_gateway",
              "order_id",
              "payment_id",
              "paid_at",
              "created_at",
              "updated_at",
            ].join(",")
          )
          .eq(
            "order_id",
            razorpayOrderId
          )
          .eq(
            "user_id",
            userId
          )
          .maybeSingle();


      if (
        purchaseError
      ) {

        console.error(
          "[MOCK PAYMENT] Purchase lookup error:",
          purchaseError
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Unable to find your payment order.",
          },
          500
        );

      }


      if (
        !purchase
      ) {

        console.error(
          "[MOCK PAYMENT] Purchase not found.",
          {
            razorpayOrderId,
            userId,
          }
        );

        return jsonResponse(
          {
            success:
              false,

            code:
              "ORDER_NOT_FOUND",

            error:
              "Payment order was not found for your account.",
          },
          404
        );

      }


      /* ===================================================
         6. VERIFY PRODUCT
         =================================================== */

      if (
        purchase.product_id !==
        PRODUCT_ID
      ) {

        console.error(
          "[MOCK PAYMENT] Product mismatch.",
          {
            databaseProduct:
              purchase.product_id,

            expectedProduct:
              PRODUCT_ID,

            orderId:
              razorpayOrderId,
          }
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "This payment order does not belong to the JPSC Mock Test Series.",
          },
          400
        );

      }


      /* ===================================================
         7. IDEMPOTENCY CHECK
         ===================================================

         If the payment was already verified,
         don't process it again.

         This is important because users can
         accidentally refresh or submit twice.
         =================================================== */

      if (
        purchase.payment_status ===
        "paid"
      ) {

        /*
         * Make sure the payment ID is consistent
         * when one already exists.
         */

        if (
          purchase.payment_id &&
          purchase.payment_id !==
            razorpayPaymentId
        ) {

          console.error(
            "[MOCK PAYMENT] Payment ID mismatch on already-paid purchase.",
            {
              databasePaymentId:
                purchase.payment_id,

              receivedPaymentId:
                razorpayPaymentId,

              orderId:
                razorpayOrderId,
            }
          );

          return jsonResponse(
            {
              success:
                false,

              error:
                "Payment verification conflict detected.",
            },
            409
          );

        }


        return jsonResponse(
          {
            success:
              true,

            verified:
              true,

            alreadyProcessed:
              true,

            message:
              "Payment has already been verified.",

            productId:
              PRODUCT_ID,

            accessGranted:
              true,
          },
          200
        );

      }


      /* ===================================================
         8. VERIFY RAZORPAY SIGNATURE
         =================================================== */

      const signatureValid =
        verifyRazorpaySignature(
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          RAZORPAY_KEY_SECRET
        );


      if (
        !signatureValid
      ) {

        console.error(
          "[MOCK PAYMENT] Razorpay signature verification failed.",
          {
            razorpayOrderId,
            razorpayPaymentId,
            userId,
          }
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Payment verification failed.",
          },
          400
        );

      }


      /* ===================================================
         9. FETCH PAYMENT DIRECTLY FROM RAZORPAY
         ===================================================

         Signature verification alone is not enough.

         We additionally ask Razorpay for the actual
         payment record.
         =================================================== */

      const razorpayCredentials =
        `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`;


      const razorpayAuth =
        Buffer
          .from(
            razorpayCredentials
          )
          .toString(
            "base64"
          );


      const paymentResponse =
        await fetch(
          `https://api.razorpay.com/v1/payments/${encodeURIComponent(
            razorpayPaymentId
          )}`,
          {
            method:
              "GET",

            headers: {
              Authorization:
                `Basic ${razorpayAuth}`,

              Accept:
                "application/json",
            },
          }
        );


      let paymentData: any;


      try {

        paymentData =
          await paymentResponse.json();

      } catch {

        console.error(
          "[MOCK PAYMENT] Razorpay returned invalid JSON."
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Unable to verify payment status with Razorpay.",
          },
          502
        );

      }


      /* ===================================================
         10. RAZORPAY API FAILURE
         =================================================== */

      if (
        !paymentResponse.ok
      ) {

        console.error(
          "[MOCK PAYMENT] Razorpay payment lookup failed:",
          paymentData
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Unable to verify payment status with Razorpay.",
          },
          502
        );

      }


      /* ===================================================
         11. VERIFY RAZORPAY ORDER ID
         =================================================== */

      if (
        paymentData?.order_id !==
        razorpayOrderId
      ) {

        console.error(
          "[MOCK PAYMENT] Razorpay order ID mismatch.",
          {
            received:
              paymentData?.order_id,

            expected:
              razorpayOrderId,
          }
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Payment order mismatch.",
          },
          400
        );

      }


      /* ===================================================
         12. VERIFY PAYMENT AMOUNT
         ===================================================

         The actual product price is fixed server-side:

         ₹499 = 49900 paise

         We DO NOT trust the browser.
         =================================================== */

      const razorpayAmount =
        Number(
          paymentData?.amount
        );


      if (
        !Number.isFinite(
          razorpayAmount
        )
      ) {

        console.error(
          "[MOCK PAYMENT] Razorpay returned invalid amount."
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Invalid payment amount returned by Razorpay.",
          },
          400
        );

      }


      if (
        razorpayAmount !==
        EXPECTED_AMOUNT_PAISE
      ) {

        console.error(
          "[MOCK PAYMENT] Payment amount mismatch.",
          {
            expected:
              EXPECTED_AMOUNT_PAISE,

            received:
              razorpayAmount,

            orderId:
              razorpayOrderId,
          }
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Payment amount does not match the JPSC Mock Test Series price of ₹499.",
          },
          400
        );

      }


      /* ===================================================
         13. VERIFY CURRENCY
         =================================================== */

      if (
        String(
          paymentData?.currency ||
          ""
        ).toUpperCase() !==
        EXPECTED_CURRENCY
      ) {

        console.error(
          "[MOCK PAYMENT] Currency mismatch.",
          {
            expected:
              EXPECTED_CURRENCY,

            received:
              paymentData?.currency,
          }
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Payment currency mismatch.",
          },
          400
        );

      }


      /* ===================================================
         14. VERIFY PAYMENT STATUS
         =================================================== */

      const paymentStatus =
        String(
          paymentData?.status ||
          ""
        ).toLowerCase();


      if (
        paymentStatus !==
        "captured"
      ) {

        /*
         * Payment is not yet captured.
         *
         * IMPORTANT:
         * Do NOT grant mock-test access.
         */

        const pendingStatus =
          paymentStatus ===
          "authorized"
            ? "authorized"
            : "pending";


        const {
          error:
            pendingUpdateError,
        } =
          await supabase
            .from(
              "purchases"
            )
            .update(
              {
                payment_id:
                  razorpayPaymentId,

                payment_gateway:
                  "razorpay",

                payment_status:
                  pendingStatus,

                updated_at:
                  new Date().toISOString(),
              }
            )
            .eq(
              "id",
              purchase.id
            )
            .eq(
              "user_id",
              userId
            );


        if (
          pendingUpdateError
        ) {

          console.error(
            "[MOCK PAYMENT] Pending payment update failed:",
            pendingUpdateError
          );

        }


        return jsonResponse(
          {
            success:
              false,

            verified:
              false,

            paymentPending:
              true,

            code:
              "PAYMENT_PENDING",

            error:
              "Payment has not been captured yet. Mock-test access has not been granted.",
          },
          409
        );

      }


      /* ===================================================
         15. VERIFY PAYMENT ID
         =================================================== */

      /*
       * If a different payment ID was already recorded
       * against this pending order, don't silently replace it.
       */

      if (
        purchase.payment_id &&
        purchase.payment_id !==
          razorpayPaymentId
      ) {

        console.error(
          "[MOCK PAYMENT] Existing payment ID differs from received payment ID.",
          {
            existing:
              purchase.payment_id,

            received:
              razorpayPaymentId,

            orderId:
              razorpayOrderId,
          }
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "This order is already associated with another payment.",
          },
          409
        );

      }


      /* ===================================================
         16. VERIFY DATABASE AMOUNT
         ===================================================

         Your purchases.amount column is numeric.

         Depending on how create-order.ts stored the amount,
         it may contain:

         499
         OR
         49900

         We accept either representation here, while the
         actual Razorpay payment MUST be exactly 49900 paise.
         =================================================== */

      const databaseAmount =
        Number(
          purchase.amount
        );


      if (
        Number.isFinite(
          databaseAmount
        )
      ) {

        const databaseAmountValid =
          databaseAmount ===
            EXPECTED_AMOUNT_RUPEES ||
          databaseAmount ===
            EXPECTED_AMOUNT_PAISE;


        if (
          !databaseAmountValid
        ) {

          console.error(
            "[MOCK PAYMENT] Database purchase amount mismatch.",
            {
              databaseAmount,
              expectedRupees:
                EXPECTED_AMOUNT_RUPEES,

              expectedPaise:
                EXPECTED_AMOUNT_PAISE,
            }
          );

          return jsonResponse(
            {
              success:
                false,

              error:
                "The stored payment order amount is invalid.",
            },
            400
          );

        }

      }


      /* ===================================================
         17. VERIFY DATABASE CURRENCY
         =================================================== */

      const databaseCurrency =
        String(
          purchase.currency ||
          EXPECTED_CURRENCY
        ).toUpperCase();


      if (
        databaseCurrency !==
        EXPECTED_CURRENCY
      ) {

        console.error(
          "[MOCK PAYMENT] Database currency mismatch.",
          {
            databaseCurrency,
          }
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "The stored payment currency is invalid.",
          },
          400
        );

      }


      /* ===================================================
         18. MARK PURCHASE AS PAID
         =================================================== */

      const paidAt =
        purchase.paid_at ||
        new Date().toISOString();


      const {
        data:
          updatedPurchase,
        error:
          updateError,
      } =
        await supabase
          .from(
            "purchases"
          )
          .update(
            {
              payment_status:
                "paid",

              payment_gateway:
                "razorpay",

              payment_id:
                razorpayPaymentId,

              paid_at:
                paidAt,

              updated_at:
                new Date().toISOString(),
            }
          )
          .eq(
            "id",
            purchase.id
          )
          .eq(
            "user_id",
            userId
          )
          .select(
            [
              "id",
              "user_id",
              "product_id",
              "product_name",
              "amount",
              "currency",
              "payment_status",
              "payment_gateway",
              "order_id",
              "payment_id",
              "paid_at",
            ].join(",")
          )
          .single();


      /* ===================================================
         19. DATABASE UPDATE FAILURE
         =================================================== */

      if (
        updateError ||
        !updatedPurchase
      ) {

        console.error(
          "[MOCK PAYMENT] Purchase update failed:",
          updateError
        );

        return jsonResponse(
          {
            success:
              false,

            paymentVerified:
              true,

            error:
              "Payment was verified, but mock-test access could not be activated. Please contact Habitat IAS support.",
          },
          500
        );

      }


      /* ===================================================
         20. FINAL SUCCESS
         =================================================== */

      console.log(
        "[MOCK PAYMENT] PAYMENT VERIFIED SUCCESSFULLY",
        {
          userId,
          purchaseId:
            updatedPurchase.id,

          productId:
            updatedPurchase.product_id,

          orderId:
            updatedPurchase.order_id,

          paymentId:
            updatedPurchase.payment_id,

          amount:
            EXPECTED_AMOUNT_RUPEES,

          currency:
            EXPECTED_CURRENCY,
        }
      );


      return jsonResponse(
        {
          success:
            true,

          verified:
            true,

          alreadyProcessed:
            false,

          accessGranted:
            true,

          productId:
            PRODUCT_ID,

          productName:
            PRODUCT_NAME,

          amount:
            EXPECTED_AMOUNT_RUPEES,

          currency:
            EXPECTED_CURRENCY,

          purchase: {

            id:
              updatedPurchase.id,

            paymentStatus:
              updatedPurchase.payment_status,

            paymentGateway:
              updatedPurchase.payment_gateway,

            orderId:
              updatedPurchase.order_id,

            paymentId:
              updatedPurchase.payment_id,

            paidAt:
              updatedPurchase.paid_at,

          },

          message:
            "Payment verified successfully. JPSC Mock Test Series access has been activated.",
        },
        200
      );


    } catch (
      error
    ) {

      console.error(
        "[MOCK PAYMENT] UNEXPECTED ERROR:",
        error
      );


      return jsonResponse(
        {
          success:
            false,

          error:
            "An unexpected error occurred while verifying the payment.",
        },
        500
      );

    }

  };