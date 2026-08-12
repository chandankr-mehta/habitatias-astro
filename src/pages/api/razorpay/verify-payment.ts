import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  PDFDocument,
  rgb,
  StandardFonts,
} from "pdf-lib";

export const prerender = false;

/*
=========================================================
ENVIRONMENT
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
SUPABASE CLIENT
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
STORAGE
=========================================================
*/

const STORAGE_BUCKET = "BOOK pdf";

const BOOK_FILES = {
  hindi:
    "jpsc-prelims-decoded-hindi.pdf",

  english:
    "jpsc-prelims-decoded-english.pdf",
} as const;


/*
=========================================================
PRODUCTS
=========================================================
*/

const PRODUCTS = {
  hindi: {
    edition: "Hindi Edition",
    language: "Hindi",
    amount: 24900,
    file: BOOK_FILES.hindi,
  },

  english: {
    edition: "English Edition",
    language: "English",
    amount: 29900,
    file: BOOK_FILES.english,
  },
} as const;


/*
=========================================================
DELIVERY
=========================================================
*/

const DELIVERY_FOLDER = "deliveries";

const SIGNED_URL_SECONDS = 60 * 60;


/*
=========================================================
JSON RESPONSE
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
NORMALIZE EDITION
=========================================================
*/

function normalizeEdition(
  value: unknown
):
  | "hindi"
  | "english"
  | null {

  const edition =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    edition === "hindi" ||
    edition === "hindi edition"
  ) {
    return "hindi";
  }

  if (
    edition === "english" ||
    edition === "english edition"
  ) {
    return "english";
  }

  return null;
}


/*
=========================================================
MASK EMAIL
=========================================================
*/

function maskEmail(
  email: string
): string {

  const clean =
    email
      .trim()
      .toLowerCase();

  const at =
    clean.indexOf("@");

  if (at <= 0) {
    return "***";
  }

  const local =
    clean.slice(0, at);

  const domain =
    clean.slice(at + 1);

  if (
    local.length === 1
  ) {
    return `*@${domain}`;
  }

  if (
    local.length === 2
  ) {
    return `${local[0]}*@${domain}`;
  }

  return (
    `${local.slice(0, 3)}***@${domain}`
  );
}


/*
=========================================================
MASK MOBILE
=========================================================
*/

function maskMobile(
  mobile: string
): string {

  const digits =
    mobile.replace(
      /\D/g,
      ""
    );

  if (
    digits.length < 4
  ) {
    return "**********";
  }

  const first =
    digits.slice(0, 2);

  const last =
    digits.slice(-2);

  return `${first}******${last}`;
}


/*
=========================================================
SAFE FILE NAME
=========================================================
*/

function safeFilePart(
  value: string
): string {

  return value
    .trim()
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    )
    .slice(0, 80);
}


/*
=========================================================
RAZORPAY SIGNATURE VERIFICATION
=========================================================
*/

function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  receivedSignature: string,
  secret: string
): boolean {

  const message =
    `${orderId}|${paymentId}`;

  const expected =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(message)
      .digest("hex");

  try {

    const expectedBuffer =
      Buffer.from(
        expected,
        "hex"
      );

    const receivedBuffer =
      Buffer.from(
        receivedSignature,
        "hex"
      );

    if (
      expectedBuffer.length !==
      receivedBuffer.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    );

  } catch {

    return false;
  }
}


/*
=========================================================
CREATE PERSONALIZED PDF
=========================================================
*/

async function createPersonalizedPdf(
  masterFile: string,
  buyerName: string,
  buyerEmail: string,
  buyerMobile: string,
  orderNumber: string
): Promise<Uint8Array> {

  if (!supabase) {
    throw new Error(
      "Supabase server client is unavailable."
    );
  }


  /*
  -------------------------------------------------------
  DOWNLOAD MASTER PDF
  -------------------------------------------------------
  */

  console.log(
    "[PDF] Downloading master:",
    masterFile
  );

  const {
    data: masterPdf,
    error: downloadError,
  } =
    await supabase
      .storage
      .from(STORAGE_BUCKET)
      .download(masterFile);


  if (
    downloadError ||
    !masterPdf
  ) {

    console.error(
      "[PDF] Master download error:",
      downloadError
    );

    throw new Error(
      "Unable to download master PDF."
    );
  }


  /*
  -------------------------------------------------------
  LOAD PDF
  -------------------------------------------------------
  */

  const buffer =
    await masterPdf.arrayBuffer();

  const pdfDoc =
    await PDFDocument.load(buffer);


  /*
  -------------------------------------------------------
  FONT
  -------------------------------------------------------
  */

  const font =
    await pdfDoc.embedFont(
      StandardFonts.Helvetica
    );


  /*
  -------------------------------------------------------
  MASKED INFORMATION
  -------------------------------------------------------
  */

  const maskedEmail =
    maskEmail(
      buyerEmail
    );

  const maskedMobile =
    maskMobile(
      buyerMobile
    );


  /*
  -------------------------------------------------------
  TEXT
  -------------------------------------------------------
  */

  const buyerLine =
    `Licensed to: ${buyerName}`;

  const emailLine =
    `Email: ${maskedEmail}`;

  const mobileLine =
    `Mobile: ${maskedMobile}`;

  const orderLine =
    `Order ID: ${orderNumber}`;

  const copyrightLine =
    "© Habitat IAS";


  /*
  -------------------------------------------------------
  ALL PDF PAGES
  -------------------------------------------------------
  */

  const pages =
    pdfDoc.getPages();

  console.log(
    `[PDF] Processing ${pages.length} pages`
  );


  /*
  =======================================================
  BUYER BOX DESIGN
  =======================================================

  Small
  Subtle
  Bottom-right
  Light background
  No full-width strip
  =======================================================
  */

  const fontSize = 6.2;

  const copyrightFontSize = 5.2;

  const lineHeight = 7.2;

  const marginRight = 10;

  const marginBottom = 10;

  const horizontalPadding = 5;

  const verticalPadding = 4;

  const boxWidth = 205;

  const boxHeight =
    4 * lineHeight +
    copyrightFontSize +
    verticalPadding * 2 +
    2;


  /*
  =======================================================
  EVERY PAGE
  =======================================================
  */

  for (
    let index = 0;
    index < pages.length;
    index++
  ) {

    const page =
      pages[index];


    /*
    -------------------------------------------------------
    PAGE SIZE
    -------------------------------------------------------
    */

    const {
      width,
    } =
      page.getSize();


    /*
    =======================================================
    BOTTOM-RIGHT POSITION
    =======================================================
    */

    const boxX =
      width -
      boxWidth -
      marginRight;

    const boxY =
      marginBottom;


    /*
    =======================================================
    LIGHT BACKGROUND
    =======================================================
    */

    page.drawRectangle({

      x: boxX,

      y: boxY,

      width: boxWidth,

      height: boxHeight,

      color:
        rgb(
          0.96,
          0.96,
          0.96
        ),

      opacity: 0.88,

      borderColor:
        rgb(
          0.78,
          0.78,
          0.78
        ),

      borderWidth: 0.35,

      borderOpacity: 0.55,

    });


    /*
    =======================================================
    BUYER NAME
    =======================================================
    */

    page.drawText(
      buyerLine,
      {

        x:
          boxX +
          horizontalPadding,

        y:
          boxY +
          boxHeight -
          verticalPadding -
          fontSize,

        size:
          fontSize,

        font,

        color:
          rgb(
            0.22,
            0.22,
            0.22
          ),

        opacity:
          0.90,

      }
    );


    /*
    =======================================================
    EMAIL
    =======================================================
    */

    page.drawText(
      emailLine,
      {

        x:
          boxX +
          horizontalPadding,

        y:
          boxY +
          boxHeight -
          verticalPadding -
          fontSize -
          lineHeight,

        size:
          fontSize,

        font,

        color:
          rgb(
            0.30,
            0.30,
            0.30
          ),

        opacity:
          0.88,

      }
    );


    /*
    =======================================================
    MOBILE
    =======================================================
    */

    page.drawText(
      mobileLine,
      {

        x:
          boxX +
          horizontalPadding,

        y:
          boxY +
          boxHeight -
          verticalPadding -
          fontSize -
          lineHeight * 2,

        size:
          fontSize,

        font,

        color:
          rgb(
            0.30,
            0.30,
            0.30
          ),

        opacity:
          0.88,

      }
    );


    /*
    =======================================================
    ORDER ID
    =======================================================
    */

    page.drawText(
      orderLine,
      {

        x:
          boxX +
          horizontalPadding,

        y:
          boxY +
          boxHeight -
          verticalPadding -
          fontSize -
          lineHeight * 3,

        size:
          fontSize,

        font,

        color:
          rgb(
            0.30,
            0.30,
            0.30
          ),

        opacity:
          0.88,

      }
    );


    /*
    =======================================================
    COPYRIGHT
    =======================================================
    */

    page.drawText(
      copyrightLine,
      {

        x:
          boxX +
          horizontalPadding,

        y:
          boxY +
          verticalPadding,

        size:
          copyrightFontSize,

        font,

        color:
          rgb(
            0.45,
            0.45,
            0.45
          ),

        opacity:
          0.75,

      }
    );


    /*
    -------------------------------------------------------
    PROGRESS
    -------------------------------------------------------
    */

    if (
      index === 0 ||
      (index + 1) % 50 === 0 ||
      index === pages.length - 1
    ) {

      console.log(
        `[PDF] Page ${index + 1}/${pages.length}`
      );

    }
  }


  /*
  =======================================================
  SAVE
  =======================================================
  */

  const personalizedPdf =
    await pdfDoc.save({

      useObjectStreams:
        true,

      addDefaultPage:
        false,

    });


  console.log(
    "[PDF] Personalized PDF created:",
    personalizedPdf.length,
    "bytes"
  );


  return personalizedPdf;
}


/*
=========================================================
UPLOAD PERSONALIZED PDF
=========================================================
*/

async function uploadPersonalizedPdf(
  pdfBytes: Uint8Array,
  orderNumber: string,
  buyerName: string
): Promise<string> {

  if (!supabase) {
    throw new Error(
      "Supabase server client is unavailable."
    );
  }


  const safeOrder =
    safeFilePart(
      orderNumber
    );

  const safeName =
    safeFilePart(
      buyerName
    );

  const unique =
    Date.now().toString();


  const filePath =
    `${DELIVERY_FOLDER}/${safeOrder}_${safeName}_${unique}.pdf`;


  console.log(
    "[PDF] Uploading:",
    filePath
  );


  const {
    error,
  } =
    await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(
        filePath,
        pdfBytes,
        {

          contentType:
            "application/pdf",

          upsert:
            false,

          cacheControl:
            "3600",

        }
      );


  if (error) {

    console.error(
      "[PDF] Upload failed:",
      error
    );

    throw new Error(
      "Unable to upload personalized PDF."
    );
  }


  return filePath;
}


/*
=========================================================
SIGNED DOWNLOAD URL
=========================================================
*/

async function createSignedUrl(
  filePath: string
): Promise<string> {

  if (!supabase) {
    throw new Error(
      "Supabase server client is unavailable."
    );
  }


  const {
    data,
    error,
  } =
    await supabase
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(
        filePath,
        SIGNED_URL_SECONDS,
        {
          download:
            true,
        }
      );


  if (error) {

    console.error(
      "[PDF] Signed URL error:",
      error
    );

    throw new Error(
      "Unable to create download link."
    );
  }


  if (
    !data?.signedUrl
  ) {

    throw new Error(
      "No signed URL returned."
    );
  }


  return data.signedUrl;
}


/*
=========================================================
MAIN POST ROUTE
=========================================================
*/

export const POST: APIRoute =
  async ({
    request,
  }) => {

    try {

      /*
      =====================================================
      1. CHECK RAZORPAY
      =====================================================
      */

      if (
        !RAZORPAY_KEY_ID ||
        !RAZORPAY_KEY_SECRET
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Razorpay is not configured.",
          },
          500
        );
      }


      /*
      =====================================================
      2. CHECK SUPABASE
      =====================================================
      */

      if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY ||
        !supabase
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Supabase is not configured.",
          },
          500
        );
      }


      /*
      =====================================================
      3. REQUEST BODY
      =====================================================
      */

      const body =
        await request.json();


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


      if (
        !razorpayPaymentId ||
        !razorpayOrderId ||
        !razorpaySignature
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Incomplete payment information.",
          },
          400
        );
      }


      /*
      =====================================================
      4. FIND ORDER
      =====================================================
      */

      const {
        data:
          existingOrder,

        error:
          findOrderError,

      } =
        await supabase
          .from("book_orders")
          .select("*")
          .eq(
            "razorpay_order_id",
            razorpayOrderId
          )
          .maybeSingle();


      if (
        findOrderError
      ) {

        console.error(
          "[ORDER] Lookup failed:",
          findOrderError
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to find order.",
          },
          500
        );
      }


      if (
        !existingOrder
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Order not found.",
          },
          404
        );
      }


      /*
      =====================================================
      5. EDITION
      =====================================================
      */

      const edition =
        normalizeEdition(
          existingOrder.edition
        );


      if (!edition) {

        return jsonResponse(
          {
            success: false,
            error:
              "Invalid book edition.",
          },
          400
        );
      }


      const product =
        PRODUCTS[edition];


      /*
      =====================================================
      6. VERIFY AMOUNT
      =====================================================
      */

      if (
        Number(
          existingOrder.amount
        ) !==
        product.amount
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Order amount does not match edition price.",
          },
          400
        );
      }


      /*
      =====================================================
      7. BUYER INFORMATION
      =====================================================
      */

      const buyerName =
        String(
          existingOrder.name ||
          existingOrder.customer_name ||
          ""
        ).trim();


      const buyerEmail =
        String(
          existingOrder.email ||
          existingOrder.customer_email ||
          ""
        ).trim();


      const buyerMobile =
        String(
          existingOrder.mobile ||
          existingOrder.customer_mobile ||
          ""
        ).trim();


      if (
        buyerName.length < 2
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Buyer name is missing from order.",
          },
          400
        );
      }


      if (!buyerEmail) {

        return jsonResponse(
          {
            success: false,
            error:
              "Buyer email is missing from order.",
          },
          400
        );
      }


      if (!buyerMobile) {

        return jsonResponse(
          {
            success: false,
            error:
              "Buyer mobile is missing from order.",
          },
          400
        );
      }


      /*
      =====================================================
      8. VERIFY SIGNATURE
      =====================================================
      */

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
          "[RAZORPAY] Invalid signature."
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Payment verification failed.",
          },
          400
        );
      }


      /*
      =====================================================
      9. VERIFY PAYMENT DIRECTLY WITH RAZORPAY
      =====================================================
      */

      const credentials =
        `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`;


      const authHeader =
        `Basic ${Buffer
          .from(credentials)
          .toString("base64")}`;


      const paymentResponse =
        await fetch(
          `https://api.razorpay.com/v1/payments/${encodeURIComponent(
            razorpayPaymentId
          )}`,
          {
            method: "GET",

            headers: {
              Authorization:
                authHeader,
            },
          }
        );


      const paymentData =
        await paymentResponse.json();


      if (
        !paymentResponse.ok
      ) {

        console.error(
          "[RAZORPAY] Payment lookup failed:",
          paymentData
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to verify payment status.",
          },
          502
        );
      }


      /*
      =====================================================
      10. ORDER ID CHECK
      =====================================================
      */

      if (
        paymentData?.order_id !==
        razorpayOrderId
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Payment order mismatch.",
          },
          400
        );
      }


      /*
      =====================================================
      11. AMOUNT CHECK
      =====================================================
      */

      if (
        Number(
          paymentData?.amount
        ) !==
        Number(
          existingOrder.amount
        )
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Payment amount mismatch.",
          },
          400
        );
      }


      /*
      =====================================================
      12. CURRENCY CHECK
      =====================================================
      */

      if (
        paymentData?.currency !==
        existingOrder.currency
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Payment currency mismatch.",
          },
          400
        );
      }


      /*
      =====================================================
      13. CAPTURE CHECK
      =====================================================
      */

      if (
        paymentData?.status !==
        "captured"
      ) {

        await supabase
          .from("book_orders")
          .update({

            razorpay_payment_id:
              razorpayPaymentId,

            razorpay_signature:
              razorpaySignature,

            payment_status:
              paymentData?.status ===
              "authorized"
                ? "authorized"
                : "created",

            updated_at:
              new Date()
                .toISOString(),

          })
          .eq(
            "id",
            existingOrder.id
          );


        return jsonResponse(
          {
            success: false,

            paymentPending:
              true,

            error:
              "Payment has not been captured yet.",
          },
          409
        );
      }


      /*
      =====================================================
      14. ORDER NUMBER
      =====================================================
      */

      const orderNumber =
        existingOrder.order_number ||
        `HAB-${Date.now()}`;


      /*
      =====================================================
      15. UPDATE ORDER
      =====================================================
      */

      const {
        data:
          updatedOrder,

        error:
          updateError,

      } =
        await supabase
          .from("book_orders")
          .update({

            razorpay_payment_id:
              razorpayPaymentId,

            razorpay_signature:
              razorpaySignature,

            payment_status:
              "captured",

            delivery_status:
              "processing",

            paid_at:
              existingOrder.paid_at ||
              new Date()
                .toISOString(),

            updated_at:
              new Date()
                .toISOString(),

          })
          .eq(
            "id",
            existingOrder.id
          )
          .select()
          .single();


      if (
        updateError
      ) {

        console.error(
          "[ORDER] Update failed:",
          updateError
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Payment verified but order update failed.",
          },
          500
        );
      }


      /*
      =====================================================
      16. GENERATE PERSONALIZED PDF
      =====================================================
      */

      let personalizedPdf:
        Uint8Array;


      try {

        personalizedPdf =
          await createPersonalizedPdf(

            product.file,

            buyerName,

            buyerEmail,

            buyerMobile,

            orderNumber

          );

      } catch (
        error
      ) {

        console.error(
          "[PDF] Personalization failed:",
          error
        );


        await supabase
          .from("book_orders")
          .update({

            delivery_status:
              "failed",

            updated_at:
              new Date()
                .toISOString(),

          })
          .eq(
            "id",
            updatedOrder.id
          );


        return jsonResponse(
          {
            success: false,

            paymentVerified:
              true,

            error:
              "Payment succeeded but personalized PDF creation failed.",
          },
          500
        );
      }


      /*
      =====================================================
      17. UPLOAD PERSONALIZED PDF
      =====================================================
      */

      let personalizedPath:
        string;


      try {

        personalizedPath =
          await uploadPersonalizedPdf(

            personalizedPdf,

            orderNumber,

            buyerName

          );

      } catch (
        error
      ) {

        console.error(
          "[PDF] Upload failed:",
          error
        );


        await supabase
          .from("book_orders")
          .update({

            delivery_status:
              "failed",

            updated_at:
              new Date()
                .toISOString(),

          })
          .eq(
            "id",
            updatedOrder.id
          );


        return jsonResponse(
          {
            success: false,

            paymentVerified:
              true,

            error:
              "Payment succeeded but personalized PDF upload failed.",
          },
          500
        );
      }


      /*
      =====================================================
      18. SIGNED DOWNLOAD URL
      =====================================================
      */

      let downloadUrl:
        string;


      try {

        downloadUrl =
          await createSignedUrl(
            personalizedPath
          );

      } catch (
        error
      ) {

        console.error(
          "[PDF] Signed URL failed:",
          error
        );


        return jsonResponse(
          {
            success: false,

            paymentVerified:
              true,

            error:
              "Personalized PDF was created but download link failed.",
          },
          500
        );
      }


      /*
      =====================================================
      19. SAVE DELIVERY PATH
      =====================================================
      */

      const {
        error:
          deliveryUpdateError,

      } =
        await supabase
          .from("book_orders")
          .update({

            delivery_path:
              personalizedPath,

            delivery_status:
              "delivered",

            updated_at:
              new Date()
                .toISOString(),

          })
          .eq(
            "id",
            updatedOrder.id
          );


      if (
        deliveryUpdateError
      ) {

        console.error(
          "[ORDER] Delivery update failed:",
          deliveryUpdateError
        );

      }


      /*
      =====================================================
      20. SUCCESS
      =====================================================
      */

      return jsonResponse(
        {

          success: true,

          verified: true,

          message:
            "Payment verified. Your personalized PDF is ready.",

          order: {

            id:
              updatedOrder.id,

            orderNumber:
              orderNumber,

            book:
              updatedOrder.book_name,

            edition:
              product.edition,

            language:
              product.language,

            amount:
              Number(
                existingOrder.amount
              ) / 100,

            currency:
              existingOrder.currency,

            paymentStatus:
              "captured",

            deliveryStatus:
              "delivered",

          },

          download: {

            available:
              true,

            url:
              downloadUrl,

            filename:
              `${safeFilePart(
                orderNumber
              )}_personalized.pdf`,

            expiresIn:
              SIGNED_URL_SECONDS,

          },

          personalization: {

            name:
              buyerName,

            email:
              maskEmail(
                buyerEmail
              ),

            mobile:
              maskMobile(
                buyerMobile
              ),

            orderId:
              orderNumber,

            appliedTo:
              "every page",

          },

        },
        200
      );


    } catch (
      error
    ) {

      console.error(
        "[VERIFY PAYMENT] Unexpected error:",
        error
      );


      return jsonResponse(
        {

          success: false,

          error:
            "Something went wrong while verifying payment.",

        },
        500
      );
    }
  };