import { createClient } from "@supabase/supabase-js";


/* =========================================================
   SERVER-SIDE SUPABASE ADMIN CLIENT
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
   PRODUCT
========================================================= */

/*
 * JPSC PRELIMS 20-TEST MOCK SERIES
 *
 * One successful paid purchase OR one valid
 * administrator-granted manual access record
 * unlocks the series.
 *
 * Individual tests are still controlled by:
 *
 *   - is_published
 *   - release_at
 *
 * Therefore:
 *
 * PAID ACCESS
 *        OR
 * MANUAL ACCESS
 *        ↓
 * PACKAGE ACCESS
 *        ↓
 * TEST PUBLISHED?
 *        ↓
 * RELEASE DATE PASSED?
 *        ↓
 * ALLOW TEST
 */

export const JPSC_MOCK_PRODUCT_ID =
  "jpsc_prelims_20_test_series";


export const JPSC_MOCK_TOTAL_TESTS =
  20;


/* =========================================================
   ACCESS RESULT
========================================================= */

export interface MockAccessResult {

  allowed: boolean;

  reason:
    | "allowed"
    | "not_logged_in"
    | "not_paid"
    | "payment_pending"
    | "payment_failed"
    | "payment_cancelled"
    | "payment_refunded"
    | "invalid_user"
    | "database_error"
    | "test_not_found"
    | "test_not_published"
    | "test_not_live";

  purchaseId:
    | number
    | null;

  productId:
    | string
    | null;

  paymentStatus:
    | string
    | null;

  /*
   * Test scheduling information.
   *
   * releaseAt:
   * ISO date/time from mock_tests.release_at
   *
   * testLive:
   * true  = student can attempt
   * false = student cannot attempt yet
   */

  releaseAt:
    | string
    | null;

  testLive:
    | boolean
    | null;

}


/* =========================================================
   EMPTY ACCESS RESULT
========================================================= */

function emptyAccessResult(
  reason:
    | "not_logged_in"
    | "not_paid"
    | "payment_pending"
    | "payment_failed"
    | "payment_cancelled"
    | "payment_refunded"
    | "invalid_user"
    | "database_error"
    | "test_not_found"
    | "test_not_published"
    | "test_not_live"
): MockAccessResult {

  return {

    allowed: false,

    reason,

    purchaseId:
      null,

    productId:
      null,

    paymentStatus:
      null,

    releaseAt:
      null,

    testLive:
      null,

  };

}


/* =========================================================
   CHECK MOCK PACKAGE ACCESS
========================================================= */

/*
 * FINAL PACKAGE ACCESS RULE
 *
 * A student gets package access when:
 *
 *     1. They are logged in
 *
 * AND
 *
 *     2A. They have a successful paid purchase
 *
 * OR
 *
 *     2B. They have administrator-granted
 *         manual access
 *
 *
 * IMPORTANT:
 *
 * Manual access DOES NOT create a payment record.
 *
 * Manual access is stored separately in:
 *
 *     manual_series_access
 *
 *
 * Therefore:
 *
 * PAID STUDENT
 *     → purchases table
 *
 * MANUAL STUDENT
 *     → manual_series_access table
 *
 * PAID + MANUAL
 *     → either source is sufficient
 *
 * NO ACCESS
 *     → neither source exists
 */

export async function checkMockAccess(
  userId:
    | string
    | null
    | undefined
): Promise<MockAccessResult> {


  /* =======================================================
     1. LOGIN REQUIRED
  ======================================================= */

  if (!userId) {

    return emptyAccessResult(
      "not_logged_in"
    );

  }


  /* =======================================================
     2. CHECK MANUAL ADMIN ACCESS
  ======================================================= */

  /*
   * This check MUST happen before the payment check.
   *
   * Why?
   *
   * A manually granted student may have:
   *
   *   - no purchase record
   *   - pending purchase
   *   - failed purchase
   *   - cancelled purchase
   *
   * Manual access is an independent entitlement.
   *
   * Therefore a valid manual access record
   * is sufficient to unlock the series.
   */

  const {
    data: manualAccess,
    error: manualAccessError,
  } =
    await supabaseAdmin

      .from(
        "manual_series_access"
      )

      .select(`
        id,
        user_id,
        product_id,
        granted_by,
        granted_at,
        updated_at
      `)

      .eq(
        "user_id",
        userId
      )

      .eq(
        "product_id",
        JPSC_MOCK_PRODUCT_ID
      )

      .maybeSingle();


  /* =======================================================
     3. MANUAL ACCESS DATABASE ERROR
  ======================================================= */

  if (manualAccessError) {

    console.error(
      "Mock access manual access lookup error:",
      manualAccessError
    );

    return emptyAccessResult(
      "database_error"
    );

  }


  /* =======================================================
     4. MANUAL ACCESS FOUND
  ======================================================= */

  if (manualAccess) {

    /*
     * IMPORTANT
     *
     * Manual access is NOT a payment.
     *
     * Therefore:
     *
     * purchaseId = null
     *
     * productId = JPSC product
     *
     * paymentStatus = "manual"
     *
     * allowed = true
     */

    return {

      allowed: true,

      reason:
        "allowed",

      purchaseId:
        null,

      productId:
        JPSC_MOCK_PRODUCT_ID,

      paymentStatus:
        "manual",

      releaseAt:
        null,

      testLive:
        null,

    };

  }


  /* =======================================================
     5. FIND LATEST PURCHASE
  ======================================================= */

  /*
   * No manual access exists.
   *
   * Therefore we now check the purchases table.
   *
   * We check purchases belonging to:
   *
   *     current user
   *
   * AND
   *
   *     JPSC mock-test product
   *
   * The latest purchase is inspected.
   */

  const {
    data: latestPurchase,
    error,
  } =
    await supabaseAdmin

      .from("purchases")

      .select(`
        id,
        user_id,
        product_id,
        product_name,
        amount,
        currency,
        payment_status,
        payment_gateway,
        order_id,
        payment_id,
        paid_at,
        created_at,
        updated_at
      `)

      .eq(
        "user_id",
        userId
      )

      .eq(
        "product_id",
        JPSC_MOCK_PRODUCT_ID
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(1)

      .maybeSingle();


  /* =======================================================
     6. DATABASE ERROR
  ======================================================= */

  if (error) {

    console.error(
      "Mock access purchase lookup error:",
      error
    );

    return emptyAccessResult(
      "database_error"
    );

  }


  /* =======================================================
     7. NO PURCHASE
  ======================================================= */

  if (!latestPurchase) {

    return emptyAccessResult(
      "not_paid"
    );

  }


  /* =======================================================
     8. PURCHASE RESULT HELPERS
  ======================================================= */

  const purchaseId =
    Number(
      latestPurchase.id
    );


  const productId =
    latestPurchase.product_id;


  const paymentStatus =
    latestPurchase.payment_status;


  /* =======================================================
     9. SUCCESSFUL PAYMENT
  ======================================================= */

  if (
    paymentStatus ===
    "paid"
  ) {

    return {

      allowed: true,

      reason:
        "allowed",

      purchaseId,

      productId,

      paymentStatus,

      releaseAt:
        null,

      testLive:
        null,

    };

  }


  /* =======================================================
     10. PAYMENT PENDING
  ======================================================= */

  if (
    paymentStatus ===
    "pending"
  ) {

    return {

      allowed: false,

      reason:
        "payment_pending",

      purchaseId,

      productId,

      paymentStatus,

      releaseAt:
        null,

      testLive:
        null,

    };

  }


  /* =======================================================
     11. PAYMENT FAILED
  ======================================================= */

  if (
    paymentStatus ===
    "failed"
  ) {

    return {

      allowed: false,

      reason:
        "payment_failed",

      purchaseId,

      productId,

      paymentStatus,

      releaseAt:
        null,

      testLive:
        null,

    };

  }


  /* =======================================================
     12. PAYMENT CANCELLED
  ======================================================= */

  if (
    paymentStatus ===
    "cancelled"
  ) {

    return {

      allowed: false,

      reason:
        "payment_cancelled",

      purchaseId,

      productId,

      paymentStatus,

      releaseAt:
        null,

      testLive:
        null,

    };

  }


  /* =======================================================
     13. PAYMENT REFUNDED
  ======================================================= */

  if (
    paymentStatus ===
    "refunded"
  ) {

    return {

      allowed: false,

      reason:
        "payment_refunded",

      purchaseId,

      productId,

      paymentStatus,

      releaseAt:
        null,

      testLive:
        null,

    };

  }


  /* =======================================================
     14. UNKNOWN PAYMENT STATUS
  ======================================================= */

  return {

    allowed: false,

    reason:
      "not_paid",

    purchaseId,

    productId,

    paymentStatus:
      paymentStatus ?? null,

    releaseAt:
      null,

    testLive:
      null,

  };

}


/* =========================================================
   TEST COVERAGE
========================================================= */

export function isTestCoveredByProduct(
  testNumber: number
): boolean {

  return (

    Number.isInteger(
      testNumber
    )

    &&

    testNumber >= 1

    &&

    testNumber <=
      JPSC_MOCK_TOTAL_TESTS

  );

}


/* =========================================================
   CHECK TEST ACCESS
========================================================= */

/*
 * FINAL ACCESS RULE
 *
 * 1. Student must be logged in.
 *
 * 2. Student must have:
 *
 *       SUCCESSFUL PAID PURCHASE
 *
 *       OR
 *
 *       ADMIN MANUAL ACCESS
 *
 * 3. Test must exist.
 *
 * 4. Test must be published.
 *
 * 5. release_at must have arrived.
 *
 * Only then:
 *
 *       allowed = true
 *
 *
 * IMPORTANT:
 *
 * Buying the complete series does NOT automatically
 * make an unreleased test attemptable.
 *
 * The same release rules apply to manual students.
 */

export async function checkTestAccess(
  userId:
    | string
    | null
    | undefined,

  testNumber: number
): Promise<MockAccessResult> {


  /* =======================================================
     1. INVALID TEST NUMBER
  ======================================================= */

  if (
    !isTestCoveredByProduct(
      testNumber
    )
  ) {

    return emptyAccessResult(
      "test_not_found"
    );

  }


  /* =======================================================
     2. CHECK PACKAGE ACCESS
  ======================================================= */

  const packageAccess =
    await checkMockAccess(
      userId
    );


  /* =======================================================
     3. LOGIN / PAYMENT / MANUAL ACCESS CHECK
  ======================================================= */

  if (
    !packageAccess.allowed
  ) {

    return packageAccess;

  }


  /* =======================================================
     4. LOAD SPECIFIC TEST
  ======================================================= */

  const {
    data: test,
    error: testError,
  } =
    await supabaseAdmin

      .from("mock_tests")

      .select(`
        id,
        test_number,
        title,
        is_published,
        release_at
      `)

      .eq(
        "test_number",
        testNumber
      )

      .maybeSingle();


  /* =======================================================
     5. DATABASE ERROR
  ======================================================= */

  if (testError) {

    console.error(
      `Mock test ${testNumber} lookup error:`,
      testError
    );

    return {

      ...packageAccess,

      allowed: false,

      reason:
        "database_error",

      releaseAt:
        null,

      testLive:
        null,

    };

  }


  /* =======================================================
     6. TEST DOES NOT EXIST
  ======================================================= */

  if (!test) {

    return {

      ...packageAccess,

      allowed: false,

      reason:
        "test_not_found",

      releaseAt:
        null,

      testLive:
        null,

    };

  }


  /* =======================================================
     7. TEST NOT PUBLISHED
  ======================================================= */

  if (
    test.is_published !== true
  ) {

    return {

      ...packageAccess,

      allowed: false,

      reason:
        "test_not_published",

      releaseAt:
        test.release_at
          ? String(
              test.release_at
            )
          : null,

      testLive:
        false,

    };

  }


  /* =======================================================
     8. RELEASE DATE REQUIRED
  ======================================================= */

  if (
    !test.release_at
  ) {

    /*
     * Fail closed.
     *
     * A published test without release_at
     * should NOT accidentally become available.
     */

    console.error(
      `Mock test ${testNumber} has no release_at date.`
    );

    return {

      ...packageAccess,

      allowed: false,

      reason:
        "test_not_live",

      releaseAt:
        null,

      testLive:
        false,

    };

  }


  /* =======================================================
     9. CHECK RELEASE DATE
  ======================================================= */

  const releaseAt =
    new Date(
      test.release_at
    );


  const now =
    new Date();


  /* =======================================================
     10. INVALID RELEASE DATE
  ======================================================= */

  if (
    Number.isNaN(
      releaseAt.getTime()
    )
  ) {

    console.error(
      `Invalid release_at for mock test ${testNumber}:`,
      test.release_at
    );

    return {

      ...packageAccess,

      allowed: false,

      reason:
        "database_error",

      releaseAt:
        String(
          test.release_at
        ),

      testLive:
        false,

    };

  }


  /* =======================================================
     11. TEST NOT LIVE YET
  ======================================================= */

  if (
    now.getTime() <
    releaseAt.getTime()
  ) {

    return {

      ...packageAccess,

      allowed: false,

      reason:
        "test_not_live",

      releaseAt:
        releaseAt.toISOString(),

      testLive:
        false,

    };

  }


  /* =======================================================
     12. TEST IS LIVE
  ======================================================= */

  return {

    ...packageAccess,

    allowed: true,

    reason:
      "allowed",

    releaseAt:
      releaseAt.toISOString(),

    testLive:
      true,

  };

}