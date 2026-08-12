import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Supabase server environment variables are missing.'
  );
}

const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export const prerender = false;

export const POST: APIRoute = async ({
  request,
  cookies,
}) => {
  try {
    console.log('');
    console.log('========================================');
    console.log('[Habitat IAS] SUBMISSION REQUEST');
    console.log('========================================');

    console.log(
      '[Habitat IAS] METHOD:',
      request.method
    );

    console.log(
      '[Habitat IAS] CONTENT-TYPE:',
      request.headers.get('content-type')
    );

    /*
     * =========================================================
     * 1. READ REQUEST BODY ONCE
     * =========================================================
     */

    const rawBody = await request.text();

    console.log(
      '[Habitat IAS] RAW BODY LENGTH:',
      rawBody.length
    );

    console.log(
      '[Habitat IAS] RAW BODY:',
      rawBody
    );

    if (!rawBody || rawBody.trim().length === 0) {
      console.error(
        '[Habitat IAS] EMPTY REQUEST BODY'
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            'The server received an empty submission body.',
          code: 'EMPTY_REQUEST_BODY',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    /*
     * =========================================================
     * 2. PARSE JSON
     * =========================================================
     */

    let body: any;

    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error(
        '[Habitat IAS] JSON PARSE ERROR:',
        parseError
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Invalid JSON submission body.',
          code: 'INVALID_JSON',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log(
      '[Habitat IAS] PARSED BODY:',
      body
    );

    /*
     * =========================================================
     * 3. EXTRACT SUBMISSION DATA
     * =========================================================
     */

    const testId = body?.testId ?? null;

    const attemptId =
      body?.attemptId ??
      null;

    const answers =
      Array.isArray(body?.answers)
        ? body.answers
        : [];

    const submittedAt =
      body?.submittedAt ??
      new Date().toISOString();

    const timeTaken =
      body?.timeTaken ??
      null;

    const automatic =
      body?.automatic ??
      false;

    console.log(
      '[Habitat IAS] TEST ID:',
      testId
    );

    console.log(
      '[Habitat IAS] ATTEMPT ID:',
      attemptId
    );

    console.log(
      '[Habitat IAS] ANSWER COUNT:',
      answers.length
    );

    console.log(
      '[Habitat IAS] TIME TAKEN:',
      timeTaken
    );

    console.log(
      '[Habitat IAS] AUTOMATIC:',
      automatic
    );

    /*
     * =========================================================
     * 4. VALIDATE TEST ID
     * =========================================================
     */

    if (!testId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'testId is required.',
          code: 'TEST_ID_REQUIRED',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    /*
     * =========================================================
     * 5. AUTHENTICATION
     * =========================================================
     */

    const authHeader =
      request.headers.get('Authorization');

    let userId: string | null = null;

    /*
     * ---------------------------------------------------------
     * Authorization header
     * ---------------------------------------------------------
     */

    if (
      authHeader &&
      authHeader.startsWith('Bearer ')
    ) {
      const accessToken =
        authHeader.substring(7);

      const {
        data: { user },
        error: authError,
      } =
        await supabaseAdmin.auth.getUser(
          accessToken
        );

      if (authError) {
        console.error(
          '[Habitat IAS] AUTH ERROR:',
          authError
        );
      } else if (user) {
        userId = user.id;
      }
    }

    /*
     * =========================================================
     * 6. FALLBACK COOKIE AUTHENTICATION
     * =========================================================
     */

    if (!userId) {
      const accessToken =
        cookies.get('sb-access-token')?.value;

      if (accessToken) {
        const {
          data: { user },
          error: cookieAuthError,
        } =
          await supabaseAdmin.auth.getUser(
            accessToken
          );

        if (cookieAuthError) {
          console.error(
            '[Habitat IAS] COOKIE AUTH ERROR:',
            cookieAuthError
          );
        } else if (user) {
          userId = user.id;
        }
      }
    }

    /*
     * =========================================================
     * 7. REQUIRE AUTHENTICATION
     * =========================================================
     */

    if (!userId) {
      console.error(
        '[Habitat IAS] USER NOT AUTHENTICATED'
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            'You must be logged in to submit the test.',
          code: 'UNAUTHENTICATED',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log(
      '[Habitat IAS] USER ID:',
      userId
    );

    /*
     * =========================================================
     * 8. VERIFY TEST
     * =========================================================
     */

    const {
      data: test,
      error: testError,
    } =
      await supabaseAdmin
        .from('mock_tests')
        .select('*')
        .eq('id', testId)
        .maybeSingle();

    if (testError) {
      console.error(
        '[Habitat IAS] TEST LOOKUP ERROR:',
        testError
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Unable to verify test.',
          details:
            testError.message,
        }),
        {
          status: 500,
          headers: {
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    if (!test) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Test not found.',
          code:
            'TEST_NOT_FOUND',
        }),
        {
          status: 404,
          headers: {
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    console.log(
      '[Habitat IAS] TEST VERIFIED:',
      testId
    );

    /*
     * =========================================================
     * 9. FIND EXISTING ATTEMPT
     * =========================================================
     */

    let currentAttemptId =
      attemptId;

    if (!currentAttemptId) {
      const {
        data: existingAttempt,
        error: attemptLookupError,
      } =
        await supabaseAdmin
          .from('mock_attempts')
          .select('*')
          .eq('test_id', testId)
          .eq('user_id', userId)
          .eq('status', 'in_progress')
          .order('created_at', {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

      if (attemptLookupError) {
        console.error(
          '[Habitat IAS] ATTEMPT LOOKUP ERROR:',
          attemptLookupError
        );
      }

      currentAttemptId =
        existingAttempt?.id ??
        null;
    }

    /*
     * =========================================================
     * 10. CREATE ATTEMPT IF NECESSARY
     * =========================================================
     */

    if (!currentAttemptId) {
      const {
        data: newAttempt,
        error: createAttemptError,
      } =
        await supabaseAdmin
          .from('mock_attempts')
          .insert({
            user_id: userId,
            test_id: testId,
            started_at:
              new Date().toISOString(),
            status:
              'in_progress',
          })
          .select()
          .single();

      if (createAttemptError) {
        console.error(
          '[Habitat IAS] CREATE ATTEMPT ERROR:',
          createAttemptError
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Unable to create test attempt.',
            details:
              createAttemptError.message,
          }),
          {
            status: 500,
            headers: {
              'Content-Type':
                'application/json',
            },
          }
        );
      }

      currentAttemptId =
        newAttempt.id;
    }

    console.log(
      '[Habitat IAS] ATTEMPT ID:',
      currentAttemptId
    );

    /*
     * =========================================================
     * 11. PROCESS ANSWERS
     * =========================================================
     */

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    /*
     * Keep track of questions actually processed.
     */

    const processedQuestionIds =
      new Set<string>();

    for (const answer of answers) {
      /*
       * -------------------------------------------------------
       * QUESTION ID
       * -------------------------------------------------------
       */

      const questionId =
        answer?.questionId ??
        answer?.question_id ??
        null;

      if (!questionId) {
        console.warn(
          '[Habitat IAS] ANSWER WITHOUT QUESTION ID:',
          answer
        );

        continue;
      }

      /*
       * -------------------------------------------------------
       * IMPORTANT:
       *
       * Frontend currently sends:
       *
       * {
       *   questionId: "...",
       *   answer: "A"
       * }
       *
       * Therefore we accept answer.answer.
       *
       * We also support the older names.
       * -------------------------------------------------------
       */

      const selectedOption =
        answer?.answer ??
        answer?.selectedOption ??
        answer?.selected_option ??
        null;

      console.log(
        '[Habitat IAS] PROCESSING:',
        {
          questionId,
          selectedOption,
        }
      );

      /*
       * -------------------------------------------------------
       * GET QUESTION
       * -------------------------------------------------------
       */

      const {
        data: question,
        error: questionError,
      } =
        await supabaseAdmin
          .from('mock_questions')
          .select(
            'id, correct_option, marks, negative_marks'
          )
          .eq('id', questionId)
          .maybeSingle();

      if (questionError) {
        console.error(
          '[Habitat IAS] QUESTION LOOKUP ERROR:',
          questionError
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Unable to verify question.',
            details:
              questionError.message,
            questionId,
          }),
          {
            status: 500,
            headers: {
              'Content-Type':
                'application/json',
            },
          }
        );
      }

      if (!question) {
        console.error(
          '[Habitat IAS] QUESTION NOT FOUND:',
          questionId
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Question not found.',
            questionId,
          }),
          {
            status: 400,
            headers: {
              'Content-Type':
                'application/json',
            },
          }
        );
      }

      processedQuestionIds.add(
        String(questionId)
      );

      /*
       * -------------------------------------------------------
       * NORMALIZE ANSWER
       * -------------------------------------------------------
       */

      const normalizedOption =
        selectedOption === null ||
        selectedOption === undefined
          ? null
          : String(
              selectedOption
            )
              .trim()
              .toUpperCase();

      /*
       * -------------------------------------------------------
       * DETERMINE ANSWERED STATUS
       * -------------------------------------------------------
       */

      const isAnswered =
        normalizedOption !== null &&
        normalizedOption !== '';

      let isCorrect:
        | boolean
        | null = null;

      if (!isAnswered) {
        unansweredCount++;
      } else {
        isCorrect =
          normalizedOption ===
          String(
            question.correct_option
          )
            .trim()
            .toUpperCase();

        if (isCorrect) {
          correctCount++;
        } else {
          incorrectCount++;
        }
      }

      /*
       * -------------------------------------------------------
       * SAVE ANSWER
       * -------------------------------------------------------
       */

      const {
        error: answerError,
      } =
        await supabaseAdmin
          .from('mock_answers')
          .upsert(
            {
              attempt_id:
                currentAttemptId,

              question_id:
                questionId,

              selected_option:
                isAnswered
                  ? normalizedOption
                  : null,

              is_correct:
                isCorrect,

              answered_at:
                isAnswered
                  ? new Date().toISOString()
                  : null,
            },
            {
              onConflict:
                'attempt_id,question_id',
            }
          );

      if (answerError) {
        console.error(
          '[Habitat IAS] SAVE ANSWER ERROR:',
          answerError
        );

        /*
         * IMPORTANT:
         * Do not report submission success
         * when an answer could not be saved.
         */

        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Unable to save your answer.',
            details:
              answerError.message,
            questionId,
          }),
          {
            status: 500,
            headers: {
              'Content-Type':
                'application/json',
            },
          }
        );
      }
    }

    /*
     * =========================================================
     * 12. LOAD ALL SAVED ANSWERS
     * =========================================================
     */

    const {
      data: savedAnswers,
      error: savedAnswersError,
    } =
      await supabaseAdmin
        .from('mock_answers')
        .select(
          `
          question_id,
          selected_option,
          is_correct
        `
        )
        .eq(
          'attempt_id',
          currentAttemptId
        );

    if (savedAnswersError) {
      console.error(
        '[Habitat IAS] SAVED ANSWERS ERROR:',
        savedAnswersError
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Unable to read saved answers.',
          details:
            savedAnswersError.message,
        }),
        {
          status: 500,
          headers: {
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    /*
     * =========================================================
     * 13. CALCULATE SCORE
     * =========================================================
     */

    let finalScore = 0;
    let maximumMarks = 0;

    /*
     * Get all questions belonging to this test.
     */

    const {
      data: testQuestions,
      error: testQuestionsError,
    } =
      await supabaseAdmin
        .from('mock_questions')
        .select(
          'id, marks, negative_marks'
        )
        .eq(
          'test_id',
          testId
        );

    if (testQuestionsError) {
      console.error(
        '[Habitat IAS] TEST QUESTIONS ERROR:',
        testQuestionsError
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Unable to calculate test marks.',
          details:
            testQuestionsError.message,
        }),
        {
          status: 500,
          headers: {
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    /*
     * Calculate maximum possible marks.
     */

    for (
      const question of
        testQuestions ?? []
    ) {
      maximumMarks +=
        Number(
          question.marks ?? 0
        );
    }

    /*
     * Calculate actual score from
     * saved answers.
     */

    for (
      const savedAnswer of
        savedAnswers ?? []
    ) {
      const question =
        (
          testQuestions ?? []
        ).find(
          q =>
            String(q.id) ===
            String(
              savedAnswer.question_id
            )
        );

      if (!question) {
        continue;
      }

      if (
        savedAnswer.is_correct ===
        true
      ) {
        finalScore +=
          Number(
            question.marks ?? 0
          );
      } else if (
        savedAnswer.is_correct ===
        false
      ) {
        finalScore -=
          Number(
            question.negative_marks ??
              0
          );
      }
    }

    /*
     * =========================================================
     * 14. RE-CALCULATE COUNTS FROM DATABASE
     * =========================================================
     *
     * This prevents the result from depending only
     * on the browser's answer array.
     */

    let finalCorrectCount = 0;
    let finalIncorrectCount = 0;
    let finalUnansweredCount = 0;

    for (
      const savedAnswer of
        savedAnswers ?? []
    ) {
      if (
        savedAnswer.is_correct ===
        true
      ) {
        finalCorrectCount++;
      } else if (
        savedAnswer.is_correct ===
        false
      ) {
        finalIncorrectCount++;
      } else {
        finalUnansweredCount++;
      }
    }

    /*
     * Use database counts as final values.
     */

    correctCount =
      finalCorrectCount;

    incorrectCount =
      finalIncorrectCount;

    unansweredCount =
      finalUnansweredCount;

    /*
     * =========================================================
     * 15. PERCENTAGE
     * =========================================================
     */

    const percentage =
      maximumMarks > 0
        ? (finalScore /
            maximumMarks) *
          100
        : 0;

    /*
     * =========================================================
     * 16. UPDATE ATTEMPT
     * =========================================================
     */

    const {
      error: updateAttemptError,
    } =
      await supabaseAdmin
        .from('mock_attempts')
        .update({
          submitted_at:
            submittedAt,

          score:
            finalScore,

          correct_count:
            correctCount,

          incorrect_count:
            incorrectCount,

          unanswered_count:
            unansweredCount,

          status:
            'submitted',
        })
        .eq(
          'id',
          currentAttemptId
        )
        .eq(
          'user_id',
          userId
        );

    if (updateAttemptError) {
      console.error(
        '[Habitat IAS] UPDATE ATTEMPT ERROR:',
        updateAttemptError
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Unable to finalize test attempt.',
          details:
            updateAttemptError.message,
        }),
        {
          status: 500,
          headers: {
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    /*
     * =========================================================
     * 17. SUCCESS LOG
     * =========================================================
     */

    console.log('');
    console.log(
      '========================================'
    );

    console.log(
      '[Habitat IAS] SUBMISSION SUCCESS'
    );

    console.log(
      '[Habitat IAS] TEST:',
      testId
    );

    console.log(
      '[Habitat IAS] USER:',
      userId
    );

    console.log(
      '[Habitat IAS] ATTEMPT:',
      currentAttemptId
    );

    console.log(
      '[Habitat IAS] SCORE:',
      finalScore
    );

    console.log(
      '[Habitat IAS] MAXIMUM MARKS:',
      maximumMarks
    );

    console.log(
      '[Habitat IAS] PERCENTAGE:',
      percentage
    );

    console.log(
      '[Habitat IAS] CORRECT:',
      correctCount
    );

    console.log(
      '[Habitat IAS] INCORRECT:',
      incorrectCount
    );

    console.log(
      '[Habitat IAS] UNANSWERED:',
      unansweredCount
    );

    console.log(
      '[Habitat IAS] TIME TAKEN:',
      timeTaken
    );

    console.log(
      '[Habitat IAS] AUTOMATIC:',
      automatic
    );

    console.log(
      '========================================'
    );

    /*
     * =========================================================
     * 18. SUCCESS RESPONSE
     * =========================================================
     */

    return new Response(
      JSON.stringify({
        success: true,

        message:
          'Test submitted successfully.',

        attemptId:
          currentAttemptId,

        testId,

        score:
          finalScore,

        maximumMarks,

        percentage:
          Number(
            percentage.toFixed(2)
          ),

        /*
         * Frontend-compatible names
         */

        correct:
          correctCount,

        wrong:
          incorrectCount,

        skipped:
          unansweredCount,

        /*
         * Existing backend-compatible names
         */

        correctCount,

        incorrectCount,

        unansweredCount,

        totalQuestions:
          test.question_count ??
          testQuestions?.length ??
          answers.length,

        timeTaken:
          timeTaken ?? 0,

        automatic,
      }),
      {
        status: 200,
        headers: {
          'Content-Type':
            'application/json',
        },
      }
    );
  } catch (error) {
    console.error('');
    console.error(
      '========================================'
    );

    console.error(
      '[Habitat IAS] SUBMIT API ERROR'
    );

    console.error(error);

    console.error(
      '========================================'
    );

    return new Response(
      JSON.stringify({
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error.',

        code:
          'SUBMIT_API_ERROR',
      }),
      {
        status: 500,
        headers: {
          'Content-Type':
            'application/json',
        },
      }
    );
  }
};