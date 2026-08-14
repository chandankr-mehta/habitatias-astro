import type { APIRoute } from "astro";

import { createClient } from "@supabase/supabase-js";

import {
  checkTestAccess,
} from "../../../lib/mockAccess";


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
   SERVER SUPABASE CLIENT
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
      },
    }
  );

}


/* =========================================================
   GET ACCESS TOKEN
========================================================= */

function getAccessToken(
  request: Request
): string | null {

  const authorization =
    request.headers.get(
      "Authorization"
    );


  if (
    authorization &&
    authorization.startsWith(
      "Bearer "
    )
  ) {

    const token =
      authorization
        .slice(7)
        .trim();


    if (token) {
      return token;
    }

  }


  return null;

}


/* =========================================================
   POST
========================================================= */

export const POST: APIRoute =
  async ({
    request,
    cookies,
  }) => {

    try {

      /* =====================================================
         1. READ REQUEST BODY
      ===================================================== */

      let body:
        Record<string, unknown> = {};


      try {

        body =
          await request.json();

      } catch {

        return jsonResponse(
          {
            success: false,

            message:
              "Invalid request body.",
          },

          400
        );

      }


      /*
       * RESTART FLAG
       *
       * The CBT frontend sends restart: true when the student
       * clicks the Restart button. Without reading this value,
       * the API always reuses the old in-progress attempt.
       */
      const restart =
        body.restart === true;


      const testId =
        Number(
          body.testId
        );


      if (
        !Number.isSafeInteger(
          testId
        ) ||
        testId <= 0
      ) {

        return jsonResponse(
          {
            success: false,

            message:
              "A valid test ID is required.",
          },

          400
        );

      }


      /* =====================================================
         2. AUTHENTICATE USER
      ===================================================== */

      const accessToken =
        getAccessToken(
          request
        );


      let userId:
        string | null = null;


      if (accessToken) {

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
          !userError &&
          userData?.user
        ) {

          userId =
            userData.user.id;

        }

      }


      /* =====================================================
         3. COOKIE FALLBACK
         
         Keep compatibility with the existing authentication
         architecture if a Supabase access token is stored
         in this cookie.
      ===================================================== */

      if (!userId) {

        const cookieToken =
          cookies.get(
            "sb-access-token"
          )?.value;


        if (cookieToken) {

          const {
            data: cookieUserData,
            error: cookieUserError,
          } =
            await supabaseAdmin
              .auth
              .getUser(
                cookieToken
              );


          if (
            !cookieUserError &&
            cookieUserData?.user
          ) {

            userId =
              cookieUserData.user.id;

          }

        }

      }


      /* =====================================================
         4. LOGIN REQUIRED
      ===================================================== */

      if (!userId) {

        return jsonResponse(
          {
            success: false,

            code:
              "LOGIN_REQUIRED",

            message:
              "Please login before attempting this mock test.",

            redirect:
              `/login?redirect=${encodeURIComponent(
                `/mock-tests/${testId}`
              )}`,
          },

          401
        );

      }


      /* =====================================================
         5. VERIFY TEST EXISTS
      ===================================================== */

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
            description,
            question_count,
            duration_minutes,
            release_at,
            is_published,
            test_type
          `)

          .eq(
            "id",
            testId
          )

          .maybeSingle();


      if (testError) {

        console.error(
          "Test lookup error:",
          testError
        );


        return jsonResponse(
          {
            success: false,

            code:
              "TEST_LOOKUP_ERROR",

            message:
              "Unable to verify the mock test.",
          },

          500
        );

      }


      if (!test) {

        return jsonResponse(
          {
            success: false,

            code:
              "TEST_NOT_FOUND",

            message:
              "Mock test not found.",
          },

          404
        );

      }


      /* =====================================================
         6. TEST PUBLISHED CHECK
      ===================================================== */

      if (
        test.is_published === false
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "TEST_NOT_PUBLISHED",

            message:
              "This mock test is not currently available.",
          },

          403
        );

      }


      /* =====================================================
         7. RELEASE DATE CHECK
         
         If release_at exists and is in the future,
         students cannot start the test.
      ===================================================== */

      if (
        test.release_at
      ) {

        const releaseTime =
          new Date(
            test.release_at
          ).getTime();


        const now =
          Date.now();


        if (
          Number.isFinite(
            releaseTime
          ) &&
          releaseTime > now
        ) {

          return jsonResponse(
            {
              success: false,

              code:
                "TEST_NOT_RELEASED",

              message:
                "This mock test has not been released yet.",
            },

            403
          );

        }

      }


      /* =====================================================
         8. VERIFY PAID ACCESS
         
         THIS IS THE CRITICAL PAYMENT GATE.
         
         LOGIN ALONE IS NOT ENOUGH.
      ===================================================== */

      const testNumber =
        Number(
          test.test_number
        );


      if (
        !Number.isSafeInteger(
          testNumber
        ) ||
        testNumber < 1 ||
        testNumber > 20
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "INVALID_TEST_NUMBER",

            message:
              "This mock test is outside the JPSC Mock Test Series.",
          },

          403
        );

      }


      /*
       * Paid-access entitlement is enforced by the corrected
       * mockAccess.ts helper.
       *
       * Product:
       *   jpsc_prelims_20_test_series
       *
       * Coverage:
       *   Tests 1Ã¢â‚¬â€œ20
       *
       * Login alone is never sufficient.
       */

      const access =
        await checkTestAccess(
          userId,
          testNumber
        );


      if (!access.allowed) {

        console.log(
          "[Habitat IAS] Mock access denied:",
          {
            userId,
            testId,
            testNumber,
            reason:
              access.reason,
            purchaseId:
              access.purchaseId,
            paymentStatus:
              access.paymentStatus,
          }
        );


        /* ================================================
           PAYMENT REQUIRED
        ================================================= */

        if (
          access.reason ===
          "not_paid"
        ) {

          return jsonResponse(
            {
              success: false,

              code:
                "PAYMENT_REQUIRED",

              message:
                "You must purchase the JPSC Mock Test Series before attempting this test.",

              redirect:
                "/mock-tests",

              reason:
                access.reason,
            },

            403
          );

        }


        /* ================================================
           PAYMENT PENDING
        ================================================= */

        if (
          access.reason ===
          "payment_pending"
        ) {

          return jsonResponse(
            {
              success: false,

              code:
                "PAYMENT_PENDING",

              message:
                "Your payment is still being processed. Please wait until it is confirmed.",

              reason:
                access.reason,
            },

            403
          );

        }


        /* ================================================
           PAYMENT FAILED
        ================================================= */

        if (
          access.reason ===
          "payment_failed"
        ) {

          return jsonResponse(
            {
              success: false,

              code:
                "PAYMENT_FAILED",

              message:
                "Your payment was not successful. Please purchase the mock test series again.",

              redirect:
                "/mock-tests",

              reason:
                access.reason,
            },

            403
          );

        }


        /* ================================================
           PAYMENT CANCELLED
        ================================================= */

        if (
          access.reason ===
          "payment_cancelled"
        ) {

          return jsonResponse(
            {
              success: false,

              code:
                "PAYMENT_CANCELLED",

              message:
                "Your payment was cancelled. Please complete the purchase before attempting the test.",

              redirect:
                "/mock-tests",

              reason:
                access.reason,
            },

            403
          );

        }


        /* ================================================
           PAYMENT REFUNDED
        ================================================= */

        if (
          access.reason ===
          "payment_refunded"
        ) {

          return jsonResponse(
            {
              success: false,

              code:
                "PAYMENT_REFUNDED",

              message:
                "This purchase has been refunded and no longer provides mock-test access.",

              redirect:
                "/mock-tests",

              reason:
                access.reason,
            },

            403
          );

        }


        /* ================================================
           DATABASE ERROR / UNKNOWN ERROR
        ================================================= */

        return jsonResponse(
          {
            success: false,

            code:
              "ACCESS_CHECK_FAILED",

            message:
              "We could not verify your purchase. Please try again later.",

            reason:
              access.reason,
          },

          503
        );

      }


      /* =====================================================
         9. CHECK EXISTING IN-PROGRESS ATTEMPT
         
         Prevent duplicate active attempts.
      ===================================================== */

      const {
        data: existingAttempt,
        error:
          existingAttemptError,
      } =
        await supabaseAdmin

          .from("mock_attempts")

          .select(`
            id,
            user_id,
            test_id,
            started_at,
            submitted_at,
            score,
            correct_count,
            incorrect_count,
            unanswered_count,
            time_taken_seconds,
            status,
            created_at
          `)

          .eq(
            "user_id",
            userId
          )

          .eq(
            "test_id",
            testId
          )

          .eq(
            "status",
            "in_progress"
          )

          .order(
            "created_at",
            {
              ascending: false,
            }
          )

          .limit(1)

          .maybeSingle();


      if (
        existingAttemptError
      ) {

        console.error(
          "Existing attempt lookup error:",
          existingAttemptError
        );


        return jsonResponse(
          {
            success: false,

            code:
              "ATTEMPT_LOOKUP_ERROR",

            message:
              "Unable to check your existing test attempt.",
          },

          500
        );

      }


      /* =====================================================
         10. HANDLE EXISTING IN-PROGRESS ATTEMPT
      ===================================================== */

      /*
       * NORMAL START:
       *
       * Reuse the current in-progress attempt so refreshing the
       * page does NOT create a duplicate attempt.
       */
      if (
        existingAttempt &&
        !restart
      ) {

        return jsonResponse(
          {
            success: true,

            existing: true,

            attemptId:
              existingAttempt.id,

            testId:
              existingAttempt.test_id,

            testNumber:
              test.test_number,

            title:
              test.title,

            startedAt:
              existingAttempt.started_at,

            status:
              existingAttempt.status,

            questionCount:
              test.question_count,

            durationMinutes:
              test.duration_minutes,

            access: {
              allowed: true,

              purchaseId:
                access.purchaseId,

              productId:
                access.productId,
            },

          }
        );

      }


      /*
       * RESTART:
       *
       * The student explicitly clicked Restart.
       *
       * Keep submitted attempts untouched. Remove only the
       * current unfinished in-progress attempt, then create
       * a completely fresh attempt below.
       *
       * This is important because the database currently uses
       * "in_progress" as the active-attempt state and the admin
       * attempt UI is built around "submitted" / "in_progress".
       */
      if (
        existingAttempt &&
        restart
      ) {

        const {
          error:
            deleteAttemptError,
        } =
          await supabaseAdmin
            .from("mock_attempts")
            .delete()
            .eq(
              "id",
              existingAttempt.id
            )
            .eq(
              "user_id",
              userId
            )
            .eq(
              "test_id",
              testId
            )
            .eq(
              "status",
              "in_progress"
            );


        if (
          deleteAttemptError
        ) {

          console.error(
            "Restart attempt delete error:",
            deleteAttemptError
          );


          return jsonResponse(
            {
              success: false,

              code:
                "ATTEMPT_RESTART_ERROR",

              message:
                "Unable to restart this test. Please try again.",
            },

            500
          );

        }

      }


      /* =====================================================
         11. CREATE NEW ATTEMPT
      ===================================================== */

      const startedAt =
        new Date().toISOString();


      const {
        data: newAttempt,
        error:
          createAttemptError,
      } =
        await supabaseAdmin

          .from("mock_attempts")

          .insert({

            user_id:
              userId,

            test_id:
              testId,

            started_at:
              startedAt,

            status:
              "in_progress",

            score:
              0,

            correct_count:
              0,

            incorrect_count:
              0,

            unanswered_count:
              0,

            time_taken_seconds:
              0,

          })

          .select(`
            id,
            user_id,
            test_id,
            started_at,
            submitted_at,
            score,
            correct_count,
            incorrect_count,
            unanswered_count,
            time_taken_seconds,
            status,
            created_at
          `)

          .single();


      if (
        createAttemptError
      ) {

        console.error(
          "Create attempt error:",
          createAttemptError
        );


        return jsonResponse(
          {
            success: false,

            code:
              "ATTEMPT_CREATE_ERROR",

            message:
              "Unable to create your mock-test attempt.",

            details:
              createAttemptError.message,
          },

          500
        );

      }


      /* =====================================================
         12. SUCCESS
      ===================================================== */

      return jsonResponse(
        {
          success: true,

          existing: false,

          attemptId:
            newAttempt.id,

          testId:
            newAttempt.test_id,

          testNumber:
            test.test_number,

          title:
            test.title,

          startedAt:
            newAttempt.started_at,

          status:
            newAttempt.status,

          questionCount:
            test.question_count,

          durationMinutes:
            test.duration_minutes,

          access: {

            allowed: true,

            purchaseId:
              access.purchaseId,

            productId:
              access.productId,

          },

        }
      );

    } catch (error) {

      console.error(
        "Start attempt API error:",
        error
      );


      return jsonResponse(
        {
          success: false,

          code:
            "SERVER_ERROR",

          message:
            error instanceof Error
              ? error.message
              : "Unexpected server error.",
        },

        500
      );

    }

  };