import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

/*
=========================================================
 HABITAT IAS
 JPSC PRELIMS DECODED
 RAZORPAY ORDER CREATION
=========================================================

 Hindi Edition   = ₹249
 English Edition = ₹299

 This API:

 1. Validates the selected edition
 2. Determines price SERVER-SIDE
 3. Creates Razorpay order
 4. Creates Habitat IAS order number
 5. Saves order in Supabase
 6. Returns safe Razorpay information to browser

 IMPORTANT:
 Never expose:
 RAZORPAY_KEY_SECRET
 SUPABASE_SERVICE_ROLE_KEY
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
 PRODUCT TABLE
=========================================================

 IMPORTANT:

 Browser does NOT determine the amount.

 Hindi   = 24900 paise
 English = 29900 paise
=========================================================
*/

const PRODUCTS = {

  hindi: {
    edition: "Hindi Edition",
    language: "Hindi",
    amount: 24900,
  },

  english: {
    edition: "English Edition",
    language: "English",
    amount: 29900,
  },

} as const;


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
      },
    }
  );

}


/*
=========================================================
 GENERATE HABITAT IAS ORDER NUMBER
=========================================================

 Example:

 HAB-20260812-ABC123
=========================================================
*/

function generateOrderNumber() {

  const date =
    new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");

  const random =
    Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

  return `HAB-${date}-${random}`;

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
      =====================================================
      1. CHECK ENVIRONMENT
      =====================================================
      */

      if (
        !RAZORPAY_KEY_ID ||
        !RAZORPAY_KEY_SECRET
      ) {

        console.error(
          "[Razorpay] Environment variables missing."
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
          "[Supabase] Server configuration missing."
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
      =====================================================
      2. READ REQUEST
      =====================================================
      */

      let body: any;

      try {

        body =
          await request.json();

      } catch {

        return jsonResponse(
          {
            success: false,
            error:
              "Invalid request data.",
          },
          400
        );

      }


      /*
      =====================================================
      3. READ CUSTOMER DATA
      =====================================================
      */

      const edition =
        String(
          body?.edition || ""
        )
          .trim()
          .toLowerCase();


      const name =
        String(
          body?.name || ""
        ).trim();


      const email =
        String(
          body?.email || ""
        )
          .trim()
          .toLowerCase();


      const mobile =
        String(
          body?.mobile || ""
        ).trim();


      /*
      =====================================================
      4. VALIDATE EDITION
      =====================================================
      */

      if (
        edition !== "hindi" &&
        edition !== "english"
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Invalid book edition.",
          },
          400
        );

      }


      /*
      =====================================================
      5. VALIDATE NAME
      =====================================================
      */

      if (
        name.length < 2
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Please enter a valid full name.",
          },
          400
        );

      }


      /*
      =====================================================
      6. VALIDATE EMAIL
      =====================================================
      */

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


      if (
        !emailRegex.test(email)
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Please enter a valid email address.",
          },
          400
        );

      }


      /*
      =====================================================
      7. VALIDATE MOBILE
      =====================================================
      */

      const cleanMobile =
        mobile.replace(
          /\D/g,
          ""
        );


      if (
        !/^[6-9]\d{9}$/.test(
          cleanMobile
        )
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Please enter a valid 10-digit Indian mobile number.",
          },
          400
        );

      }


      /*
      =====================================================
      8. GET PRODUCT
      =====================================================

      This is the security-critical part.

      We NEVER use:

        body.price

      The server decides the amount.
      =====================================================
      */

      const product =
        PRODUCTS[
          edition as keyof typeof PRODUCTS
        ];


      if (!product) {

        return jsonResponse(
          {
            success: false,
            error:
              "Selected product could not be found.",
          },
          400
        );

      }


      /*
      =====================================================
      9. GENERATE OUR ORDER NUMBER
      =====================================================
      */

      const orderNumber =
        generateOrderNumber();


      /*
      =====================================================
      10. CREATE RAZORPAY RECEIPT
      =====================================================
      */

      const receipt =
        `habitat_${edition}_${Date.now()}`;


      /*
      =====================================================
      11. CREATE RAZORPAY AUTHORIZATION
      =====================================================
      */

      const credentials =
        `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`;


      const authHeader =
        `Basic ${Buffer
          .from(credentials)
          .toString("base64")}`;


      /*
      =====================================================
      12. CREATE RAZORPAY ORDER
      =====================================================
      */

      console.log(
        "[Razorpay] Creating order:",
        {
          edition,
          amount:
            product.amount,
          currency:
            "INR",
        }
      );


      const razorpayResponse =
        await fetch(
          "https://api.razorpay.com/v1/orders",
          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

              Authorization:
                authHeader,

            },

            body:
              JSON.stringify({

                amount:
                  product.amount,

                currency:
                  "INR",

                receipt,

                notes: {

                  book:
                    "JPSC Prelims Decoded: Topic-Wise PYQs",

                  edition:
                    product.edition,

                  language:
                    product.language,

                  habitat_order_number:
                    orderNumber,

                  customer_name:
                    name,

                  customer_email:
                    email,

                  customer_mobile:
                    cleanMobile,

                },

              }),

          }
        );


      /*
      =====================================================
      13. READ RAZORPAY RESPONSE
      =====================================================
      */

      const razorpayData =
        await razorpayResponse.json();


      /*
      =====================================================
      14. RAZORPAY ERROR
      =====================================================
      */

      if (
        !razorpayResponse.ok
      ) {

        console.error(
          "[Razorpay] Order creation failed:",
          razorpayData
        );


        return jsonResponse(
          {
            success: false,

            error:
              razorpayData
                ?.error
                ?.description ||
              "Unable to create Razorpay order.",
          },
          502
        );

      }


      /*
      =====================================================
      15. ENSURE ORDER ID EXISTS
      =====================================================
      */

      if (
        !razorpayData?.id
      ) {

        console.error(
          "[Razorpay] Order ID missing:",
          razorpayData
        );


        return jsonResponse(
          {
            success: false,

            error:
              "Razorpay did not return an order ID.",
          },
          502
        );

      }


      /*
      =====================================================
      16. VERIFY RAZORPAY AMOUNT
      =====================================================

      Additional safety check.
      =====================================================
      */

      if (
        Number(
          razorpayData.amount
        ) !==
        product.amount
      ) {

        console.error(
          "[Razorpay] Amount mismatch:",
          {
            expected:
              product.amount,

            received:
              razorpayData.amount,
          }
        );


        return jsonResponse(
          {
            success: false,

            error:
              "Razorpay order amount does not match the selected edition.",
          },
          502
        );

      }


      /*
      =====================================================
      17. SAVE ORDER TO SUPABASE
      =====================================================

      At this point:

      Razorpay order exists
      +
      We know customer
      +
      We know edition
      +
      We know server-side price

      So we create our internal order record.
      =====================================================
      */

      const {
        data: databaseOrder,
        error:
          databaseError,
      } = await supabase
        .from("book_orders")
        .insert({

          order_number:
            orderNumber,

          book_name:
            "JPSC Prelims Decoded: Topic-Wise PYQs",

          edition:
            product.edition,

          language:
            product.language,

          amount:
            product.amount,

          currency:
            "INR",

          customer_name:
            name,

          customer_email:
            email,

          customer_mobile:
            cleanMobile,

          razorpay_order_id:
            razorpayData.id,

          payment_status:
            "created",

          delivery_status:
            "pending",

        })
        .select()
        .single();


      /*
      =====================================================
      18. DATABASE ERROR
      =====================================================
      */

      if (
        databaseError
      ) {

        console.error(
          "[Supabase] Failed to save order:",
          databaseError
        );


        /*
         * IMPORTANT:
         *
         * A Razorpay order has already been created.
         *
         * We do NOT give the browser a usable checkout
         * response if our database record failed.
         *
         * This prevents taking payment without our
         * internal order record.
         */

        return jsonResponse(
          {
            success: false,

            error:
              "The payment order was created but could not be recorded. Please try again.",
          },
          500
        );

      }


      /*
      =====================================================
      19. LOG SUCCESS
      =====================================================
      */

      console.log(
        "[Habitat IAS] Order created:",
        {
          habitatOrder:
            databaseOrder.order_number,

          razorpayOrder:
            razorpayData.id,

          edition:
            product.edition,

          amount:
            product.amount,
        }
      );


      /*
      =====================================================
      20. RETURN SAFE DATA TO BROWSER
      =====================================================

      NEVER return:

        RAZORPAY_KEY_SECRET
        SUPABASE_SERVICE_ROLE_KEY
      =====================================================
      */

      return jsonResponse(
        {

          success: true,

          order: {

            id:
              razorpayData.id,

            amount:
              razorpayData.amount,

            currency:
              razorpayData.currency,

          },

          orderId:
            razorpayData.id,

          keyId:
            RAZORPAY_KEY_ID,

          habitatOrderNumber:
            databaseOrder.order_number,

          product: {

            edition:
              product.edition,

            language:
              product.language,

            price:
              product.amount / 100,

            amount:
              product.amount,

          },

        },

        200
      );


    } catch (error) {

      /*
      =====================================================
      GLOBAL ERROR
      =====================================================
      */

      console.error(
        "[Razorpay] Create order error:",
        error
      );


      return jsonResponse(
        {
          success: false,

          error:
            "Something went wrong while creating the payment order.",
        },

        500
      );

    }

  };