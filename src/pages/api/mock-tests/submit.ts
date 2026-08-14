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
   RESPONSE HELPER
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
   AUTH TOKEN
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
   NORMALIZE OPTION
========================================================= */

function normalizeOption(
  value: unknown
): string | null {

  if (
    value === null ||
    value === undefined
  ) {

    return null;

  }


  const normalized =
    String(value)
      .trim()
      .toUpperCase();


  if (
    normalized === "" ||
    normalized === "NULL"
  ) {

    return null;

  }


  if (
    ![
      "A",
      "B",
      "C",
      "D",
    ].includes(
      normalized
    )
  ) {

    return null;

  }


  return normalized;

}


/* =========================================================
   POST /api/mock-tests/submit
========================================================= */

export const POST: APIRoute =
  async ({
    request,
  }) => {

    try {

      /* =====================================================
         1. METHOD
      ===================================================== */

      if (
        request.method !==
        "POST"
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "METHOD_NOT_ALLOWED",

            message:
              "Only POST requests are allowed.",
          },

          405
        );

      }


      /* =====================================================
         2. READ BODY
      ===================================================== */

      let body:
        Record<string, any>;


      try {

        body =
          await request.json();

      } catch {

        return jsonResponse(
          {
            success: false,

            code:
              "INVALID_JSON",

            message:
              "Invalid JSON request body.",
          },

          400
        );

      }


      /* =====================================================
         3. TEST ID
      ===================================================== */

      const testId =
        Number(
          body?.testId
        );


      if (
        !Number.isInteger(
          testId
        ) ||
        testId <= 0
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "INVALID_TEST_ID",

            message:
              "A valid test ID is required.",
          },

          400
        );

      }


      /* =====================================================
         4. ATTEMPT ID
         
         The frontend should send the attempt created by
         /api/mock-tests/start.
      ===================================================== */

      const requestedAttemptId =
        Number(
          body?.attemptId
        );


      if (
        !Number.isInteger(
          requestedAttemptId
        ) ||
        requestedAttemptId <= 0
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "INVALID_ATTEMPT_ID",

            message:
              "A valid mock-test attempt is required. Please restart the test.",
          },

          400
        );

      }


      /* =====================================================
         5. AUTHENTICATE USER
      ===================================================== */

      const accessToken =
        getAccessToken(
          request
        );


      if (!accessToken) {

        return jsonResponse(
          {
            success: false,

            code:
              "LOGIN_REQUIRED",

            message:
              "Your login session is required to submit this test.",
          },

          401
        );

      }


      /* =====================================================
         6. VERIFY TOKEN
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

        return jsonResponse(
          {
            success: false,

            code:
              "INVALID_SESSION",

            message:
              "Your login session is invalid or expired. Please login again.",
          },

          401
        );

      }


      const userId =
        userData.user.id;


      /* =====================================================
         7. VERIFY PAID ACCESS
         
         LOGIN ALONE IS NOT ENOUGH.
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
            question_count,
            duration_minutes,
            is_published,
            release_at,
            test_type
          `)

          .eq(
            "id",
            testId
          )

          .maybeSingle();


      if (testError) {

        console.error(
          "Submit test lookup error:",
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
         8. PUBLISHED CHECK
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
              "This mock test is not available.",
          },

          403
        );

      }


      /* =====================================================
         9. RELEASE CHECK
      ===================================================== */

      if (
        test.release_at
      ) {

        const releaseTime =
          new Date(
            test.release_at
          ).getTime();


        if (
          Number.isFinite(
            releaseTime
          ) &&
          releaseTime >
            Date.now()
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
         10. PAID ENTITLEMENT
      ===================================================== */

      const access =
        await checkTestAccess(
          userId,
          Number(
            test.test_number
          )
        );


      if (!access.allowed) {

        return jsonResponse(
          {
            success: false,

            code:
              "ACCESS_DENIED",

            message:
              "You do not have valid paid access to this mock-test series.",

            reason:
              access.reason,
          },

          403
        );

      }


      /* =====================================================
         11. VERIFY ATTEMPT
         
         CRITICAL:
         The attempt must belong to:
           - authenticated user
           - requested test
           - current in-progress status
      ===================================================== */

      const {
        data: attempt,
        error: attemptError,
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
            status
          `)

          .eq(
            "id",
            requestedAttemptId
          )

          .maybeSingle();


      if (attemptError) {

        console.error(
          "Attempt lookup error:",
          attemptError
        );


        return jsonResponse(
          {
            success: false,

            code:
              "ATTEMPT_LOOKUP_ERROR",

            message:
              "Unable to verify your test attempt.",
          },

          500
        );

      }


      if (!attempt) {

        return jsonResponse(
          {
            success: false,

            code:
              "ATTEMPT_NOT_FOUND",

            message:
              "This test attempt could not be found.",
          },

          404
        );

      }


      /* =====================================================
         12. ATTEMPT OWNERSHIP
      ===================================================== */

      if (
        String(
          attempt.user_id
        ) !==
        String(
          userId
        )
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "ATTEMPT_FORBIDDEN",

            message:
              "This test attempt does not belong to your account.",
          },

          403
        );

      }


      /* =====================================================
         13. TEST OWNERSHIP
      ===================================================== */

      if (
        Number(
          attempt.test_id
        ) !==
        Number(
          testId
        )
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "ATTEMPT_TEST_MISMATCH",

            message:
              "This attempt does not belong to the selected test.",
          },

          403
        );

      }


      /* =====================================================
         14. ATTEMPT STATUS
      ===================================================== */

      if (
        attempt.status !==
        "in_progress"
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "ATTEMPT_ALREADY_SUBMITTED",

            message:
              "This test attempt has already been submitted.",
          },

          409
        );

      }


      /* =====================================================
         15. ANSWERS
      ===================================================== */

      const incomingAnswers =
        Array.isArray(
          body?.answers
        )
          ? body.answers
          : [];


      /*
       * Map by question ID.
       *
       * This also prevents duplicate question IDs from
       * being counted multiple times.
       */

      const answerMap =
        new Map<
          number,
          string | null
        >();


      for (
        const item
        of incomingAnswers
      ) {

        const questionId =
          Number(
            item?.questionId
          );


        if (
          !Number.isInteger(
            questionId
          ) ||
          questionId <= 0
        ) {

          continue;

        }


        const selectedOption =
          normalizeOption(
            item?.selectedOption ??
            item?.selected_option ??
            item?.answer
          );


        answerMap.set(
          questionId,
          selectedOption
        );

      }


      /* =====================================================
         16. LOAD QUESTIONS
         
         Correct answers are obtained ONLY on server.
      ===================================================== */

      const {
        data: questionRows,
        error: questionError,
      } =
        await supabaseAdmin

          .from("mock_questions")

          .select(`
            id,
            test_id,
            question_number,
            correct_option,
            marks,
            negative_marks
          `)

          .eq(
            "test_id",
            testId
          )

          .order(
            "question_number",
            {
              ascending: true,
            }
          );


      if (questionError) {

        console.error(
          "Question lookup error:",
          questionError
        );


        return jsonResponse(
          {
            success: false,

            code:
              "QUESTION_LOOKUP_ERROR",

            message:
              "Unable to evaluate the test questions.",
          },

          500
        );

      }


      const questions =
        questionRows ?? [];


      if (
        questions.length === 0
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "NO_QUESTIONS",

            message:
              "This mock test currently has no questions.",
          },

          400
        );

      }


      /* =====================================================
         17. VERIFY QUESTION IDS
         
         Ignore any question IDs that don't belong to
         this test.
      ===================================================== */

      const validQuestionIds =
        new Set(
          questions.map(
            (question) =>
              Number(
                question.id
              )
          )
        );


      const sanitizedAnswers =
        new Map<
          number,
          string | null
        >();


      for (
        const [
          questionId,
          selectedOption
        ]
        of answerMap.entries()
      ) {

        if (
          validQuestionIds.has(
            questionId
          )
        ) {

          sanitizedAnswers.set(
            questionId,
            selectedOption
          );

        }

      }


      /* =====================================================
         18. SCORE SERVER-SIDE
         
         HABITAT IAS JPSC RULE:
         
         Correct     +2
         Incorrect    0
         Unanswered   0
         
         NO NEGATIVE MARKING.
         
         We intentionally DO NOT subtract negative_marks.
      ===================================================== */

      let score =
        0;

      let correctCount =
        0;

      let incorrectCount =
        0;

      let unansweredCount =
        0;


      for (
        const question
        of questions
      ) {

        const questionId =
          Number(
            question.id
          );


        const selectedOption =
          sanitizedAnswers.get(
            questionId
          );


        const correctOption =
          normalizeOption(
            question.correct_option
          );


        /* =================================================
           UNANSWERED
        ================================================= */

        if (
          !selectedOption
        ) {

          unansweredCount++;

          continue;

        }


        /* =================================================
           CORRECT
        ================================================= */

        if (
          correctOption &&
          selectedOption ===
            correctOption
        ) {

          correctCount++;

          /*
           * Current JPSC mock configuration:
           * +2 marks per correct answer.
           */

          score += 2;

          continue;

        }


        /* =================================================
           INCORRECT
           
           IMPORTANT:
           NO NEGATIVE MARKING.
        ================================================= */

        incorrectCount++;

      }


      /* =====================================================
         19. QUESTION COUNT CONSISTENCY
      ===================================================== */

      unansweredCount =
        Math.max(
          0,
          questions.length -
          correctCount -
          incorrectCount
        );


      /* =====================================================
         20. TIME
         
         Browser time is accepted as a convenience, but
         server-side elapsed time is used as the authoritative
         upper bound.
      ===================================================== */

      const browserTime =
        Math.max(
          0,
          Number(
            body?.timeTaken
          ) || 0
        );


      const startedAtMs =
        new Date(
          attempt.started_at
        ).getTime();


      const serverElapsed =
        Number.isFinite(
          startedAtMs
        )
          ? Math.max(
              0,
              Math.floor(
                (
                  Date.now() -
                  startedAtMs
                ) / 1000
              )
            )
          : browserTime;


      const configuredDuration =
        Math.max(
          0,
          Number(
            test.duration_minutes
          ) || 0
        ) * 60;


      /*
       * We don't allow the client to report more time than
       * the actual server elapsed time by a large margin.
       *
       * If the server clock is available, use the smaller
       * of browser-reported and server elapsed time.
       */

      let timeTaken =
        serverElapsed;


      if (
        browserTime > 0
      ) {

        timeTaken =
          Math.min(
            browserTime,
            serverElapsed
          );

      }


      /*
       * Never exceed configured test duration.
       */

      if (
        configuredDuration > 0
      ) {

        timeTaken =
          Math.min(
            timeTaken,
            configuredDuration
          );

      }


      timeTaken =
        Math.max(
          0,
          Math.floor(
            timeTaken
          )
        );


      /* =====================================================
         21. PREVENT DUPLICATE ANSWERS
         
         Existing answers are removed only for an
         in-progress attempt immediately before finalization.
      ===================================================== */

      const {
        error:
          deleteAnswersError,
      } =
        await supabaseAdmin

          .from("mock_answers")

          .delete()

          .eq(
            "attempt_id",
            requestedAttemptId
          );


      if (
        deleteAnswersError
      ) {

        console.error(
          "Existing answer cleanup error:",
          deleteAnswersError
        );


        return jsonResponse(
          {
            success: false,

            code:
              "ANSWER_CLEANUP_ERROR",

            message:
              "Unable to prepare your answers for final submission.",
          },

          500
        );

      }


      /* =====================================================
         22. BUILD ANSWER RECORDS
      ===================================================== */

      const answerRows =
        questions
          .map(
            (
              question
            ) => {

              const questionId =
                Number(
                  question.id
                );


              const selectedOption =
                sanitizedAnswers.get(
                  questionId
                ) ??
                null;


              let isCorrect:
                boolean | null =
                null;


              if (
                selectedOption
              ) {

                const correctOption =
                  normalizeOption(
                    question.correct_option
                  );


                isCorrect =
                  Boolean(
                    correctOption &&
                    selectedOption ===
                      correctOption
                  );

              }


              return {

                attempt_id:
                  requestedAttemptId,

                question_id:
                  questionId,

                selected_option:
                  selectedOption,

                is_correct:
                  isCorrect,

              };

            }
          );


      /* =====================================================
         23. INSERT ANSWERS
      ===================================================== */

      if (
        answerRows.length > 0
      ) {

        const {
          error:
            answerInsertError,
        } =
          await supabaseAdmin

            .from("mock_answers")

            .insert(
              answerRows
            );


        if (
          answerInsertError
        ) {

          console.error(
            "Answer insert error:",
            answerInsertError
          );


          return jsonResponse(
            {
              success: false,

              code:
                "ANSWER_SAVE_ERROR",

              message:
                "Unable to save your answers.",
            },

            500
          );

        }

      }


      /* =====================================================
         24. FINALIZE ATTEMPT
      ===================================================== */

      const submittedAt =
        new Date()
          .toISOString();


      const {
        data:
          updatedAttempt,
        error:
          updateAttemptError,
      } =
        await supabaseAdmin

          .from("mock_attempts")

          .update({

            submitted_at:
              submittedAt,

            score:
              score,

            correct_count:
              correctCount,

            incorrect_count:
              incorrectCount,

            unanswered_count:
              unansweredCount,

            time_taken_seconds:
              timeTaken,

            status:
              "submitted",

          })

          .eq(
            "id",
            requestedAttemptId
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
          )

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
            status
          `)

          .maybeSingle();


      if (
        updateAttemptError
      ) {

        console.error(
          "Attempt finalization error:",
          updateAttemptError
        );


        return jsonResponse(
          {
            success: false,

            code:
              "ATTEMPT_FINALIZE_ERROR",

            message:
              "Your answers were saved, but the attempt could not be finalized. Please contact support.",
          },

          500
        );

      }


      /*
       * If no row was returned, another request may have
       * finalized the attempt first.
       */

      if (
        !updatedAttempt
      ) {

        return jsonResponse(
          {
            success: false,

            code:
              "ATTEMPT_ALREADY_FINALIZED",

            message:
              "This test attempt has already been submitted.",
          },

          409
        );

      }


      /* =====================================================
         25. PERCENTAGE
      ===================================================== */

      const maximumMarks =
        questions.length *
        2;


      const percentage =
        maximumMarks > 0
          ? Number(
              (
                (
                  score /
                  maximumMarks
                ) *
                100
              ).toFixed(2)
            )
          : 0;


      /* =====================================================
         26. SUCCESS RESPONSE
      ===================================================== */

      return jsonResponse(
        {
          success: true,

          message:
            "Mock test submitted successfully.",

          attemptId:
            updatedAttempt.id,

          testId:
            updatedAttempt.test_id,

          status:
            updatedAttempt.status,

          score:
            score,

          maximumMarks:
            maximumMarks,

          percentage:
            percentage,

          correctCount:
            correctCount,

          incorrectCount:
            incorrectCount,

          unansweredCount:
            unansweredCount,

          timeTaken:
            timeTaken,

          submittedAt:
            updatedAttempt.submitted_at,

        },

        200
      );


    } catch (error) {

      console.error(
        "Submit mock test API error:",
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