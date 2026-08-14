import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   ENVIRONMENT
========================================================= */

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const adminUserId =
  import.meta.env.ADMIN_USER_ID;

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

if (!adminUserId) {
  throw new Error(
    "ADMIN_USER_ID is missing."
  );
}

/* =========================================================
   SERVER-ONLY SUPABASE ADMIN CLIENT
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
   HELPERS
========================================================= */

function getTestId(
  params: Record<string, string | undefined>
) {
  const id = Number(params.id);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return id;
}

/* =========================================================
   JSON RESPONSE
========================================================= */

function json(
  data: unknown,
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

        "Pragma":
          "no-cache",
      },
    }
  );
}

/* =========================================================
   ADMIN AUTHENTICATION
========================================================= */

async function requireAdmin(
  cookies: any
): Promise<
  | {
      authorized: true;
      userId: string;
    }
  | {
      authorized: false;
      response: Response;
    }
> {

  /*
   * The student's/admin's access token is stored
   * in the server-side cookie.
   */
  const accessToken =
    cookies.get(
      "habitat-access-token"
    )?.value;

  /*
   * No authenticated session.
   */
  if (!accessToken) {

    return {
      authorized: false,

      response: json(
        {
          success: false,
          error:
            "Authentication required.",
        },
        401
      ),
    };
  }

  /*
   * Validate the Supabase session.
   */
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .auth
      .getUser(
        accessToken
      );

  /*
   * Invalid / expired session.
   */
  if (
    error ||
    !data?.user
  ) {

    return {
      authorized: false,

      response: json(
        {
          success: false,
          error:
            "Invalid or expired session.",
        },
        401
      ),
    };
  }

  const userId =
    data.user.id;

  /*
   * Only the configured administrator
   * may modify mock-test questions.
   */
  if (
    userId !== adminUserId
  ) {

    return {
      authorized: false,

      response: json(
        {
          success: false,
          error:
            "Admin access denied.",
        },
        403
      ),
    };
  }

  return {
    authorized: true,
    userId,
  };
}

/* =========================================================
   POST — ADD QUESTION
========================================================= */

export const POST: APIRoute =
  async ({
    params,
    request,
    cookies,
  }) => {

    /*
     * SECURITY:
     * Only administrator can create questions.
     */
    const admin =
      await requireAdmin(
        cookies
      );

    if (!admin.authorized) {
      return admin.response;
    }

    const testId =
      getTestId(params);

    if (!testId) {
      return json(
        {
          error:
            "Invalid test ID.",
        },
        400
      );
    }

    try {

      const body =
        await request.json();

      /* =====================================================
         VALIDATION
      ===================================================== */

      const questionNumber =
        Number(
          body.question_number
        );

      const questionText =
        String(
          body.question_text || ""
        ).trim();

      const optionA =
        String(
          body.option_a || ""
        ).trim();

      const optionB =
        String(
          body.option_b || ""
        ).trim();

      const optionC =
        String(
          body.option_c || ""
        ).trim();

      const optionD =
        String(
          body.option_d || ""
        ).trim();

      const correctOption =
        String(
          body.correct_option || ""
        )
          .trim()
          .toUpperCase();

      if (
        !Number.isInteger(
          questionNumber
        ) ||
        questionNumber <= 0
      ) {
        return json(
          {
            error:
              "Question number must be a positive integer.",
          },
          400
        );
      }

      if (!questionText) {
        return json(
          {
            error:
              "Question text is required.",
          },
          400
        );
      }

      if (
        !optionA ||
        !optionB ||
        !optionC ||
        !optionD
      ) {
        return json(
          {
            error:
              "All four options are required.",
          },
          400
        );
      }

      if (
        ![
          "A",
          "B",
          "C",
          "D",
        ].includes(
          correctOption
        )
      ) {
        return json(
          {
            error:
              "Correct option must be A, B, C or D.",
          },
          400
        );
      }

      /* =====================================================
         VERIFY TEST EXISTS
      ===================================================== */

      const {
        data: test,
        error: testError,
      } =
        await supabaseAdmin
          .from("mock_tests")
          .select("id")
          .eq(
            "id",
            testId
          )
          .single();

      if (
        testError ||
        !test
      ) {
        return json(
          {
            error:
              "Mock test not found.",
          },
          404
        );
      }

      /* =====================================================
         PREVENT DUPLICATE QUESTION NUMBER
      ===================================================== */

      const {
        data:
          existingQuestion,
        error:
          duplicateError,
      } =
        await supabaseAdmin
          .from(
            "mock_questions"
          )
          .select("id")
          .eq(
            "test_id",
            testId
          )
          .eq(
            "question_number",
            questionNumber
          )
          .maybeSingle();

      if (duplicateError) {

        console.error(
          "Duplicate check error:",
          duplicateError
        );

        return json(
          {
            error:
              "Unable to check question number.",
          },
          500
        );
      }

      if (
        existingQuestion
      ) {
        return json(
          {
            error:
              `Question number ${questionNumber} already exists in this test.`,
          },
          409
        );
      }

      /* =====================================================
         INSERT
      ===================================================== */

      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from(
            "mock_questions"
          )
          .insert({
            test_id:
              testId,

            question_number:
              questionNumber,

            question_text:
              questionText,

            option_a:
              optionA,

            option_b:
              optionB,

            option_c:
              optionC,

            option_d:
              optionD,

            correct_option:
              correctOption,

            explanation:
              body.explanation
                ? String(
                    body.explanation
                  ).trim()
                : null,

            subject:
              body.subject
                ? String(
                    body.subject
                  ).trim()
                : null,

            topic:
              body.topic
                ? String(
                    body.topic
                  ).trim()
                : null,

            difficulty:
              body.difficulty ||
              "medium",

            /*
             * JPSC MOCK TEST SCORING
             *
             * Correct   = +2
             * Incorrect =  0
             */
            marks: 2,

            negative_marks: 0,

            image_url:
              body.image_url
                ? String(
                    body.image_url
                  ).trim()
                : null,

            available_at:
              body.available_at ||
              null,
          })
          .select("*")
          .single();

      if (error) {

        console.error(
          "Question insert error:",
          error
        );

        return json(
          {
            error:
              error.message ||
              "Unable to create question.",
          },
          500
        );
      }

      return json(
        {
          success: true,

          message:
            "Question created successfully.",

          question: data,
        },
        201
      );

    } catch (error) {

      console.error(
        "POST question error:",
        error
      );

      return json(
        {
          error:
            "Invalid request.",
        },
        400
      );
    }
  };

/* =========================================================
   PUT — UPDATE QUESTION
========================================================= */

export const PUT: APIRoute =
  async ({
    params,
    request,
    cookies,
  }) => {

    /*
     * SECURITY:
     * Only administrator can update questions.
     */
    const admin =
      await requireAdmin(
        cookies
      );

    if (!admin.authorized) {
      return admin.response;
    }

    const testId =
      getTestId(params);

    if (!testId) {
      return json(
        {
          error:
            "Invalid test ID.",
        },
        400
      );
    }

    try {

      const body =
        await request.json();

      const questionId =
        Number(
          body.id
        );

      if (
        !Number.isInteger(
          questionId
        ) ||
        questionId <= 0
      ) {
        return json(
          {
            error:
              "Valid question ID is required.",
          },
          400
        );
      }

      const questionNumber =
        Number(
          body.question_number
        );

      const correctOption =
        String(
          body.correct_option || ""
        )
          .trim()
          .toUpperCase();

      if (
        !Number.isInteger(
          questionNumber
        ) ||
        questionNumber <= 0
      ) {
        return json(
          {
            error:
              "Question number must be a positive integer.",
          },
          400
        );
      }

      if (
        ![
          "A",
          "B",
          "C",
          "D",
        ].includes(
          correctOption
        )
      ) {
        return json(
          {
            error:
              "Correct option must be A, B, C or D.",
          },
          400
        );
      }

      /* =====================================================
         VERIFY QUESTION BELONGS TO THIS TEST
      ===================================================== */

      const {
        data:
          existingQuestion,
        error:
          existingError,
      } =
        await supabaseAdmin
          .from(
            "mock_questions"
          )
          .select(
            "id, test_id"
          )
          .eq(
            "id",
            questionId
          )
          .eq(
            "test_id",
            testId
          )
          .single();

      if (
        existingError ||
        !existingQuestion
      ) {
        return json(
          {
            error:
              "Question not found in this test.",
          },
          404
        );
      }

      /* =====================================================
         DUPLICATE QUESTION NUMBER CHECK
      ===================================================== */

      const {
        data:
          duplicateQuestion,
        error:
          duplicateError,
      } =
        await supabaseAdmin
          .from(
            "mock_questions"
          )
          .select("id")
          .eq(
            "test_id",
            testId
          )
          .eq(
            "question_number",
            questionNumber
          )
          .neq(
            "id",
            questionId
          )
          .maybeSingle();

      if (duplicateError) {

        console.error(
          "Duplicate check error:",
          duplicateError
        );

        return json(
          {
            error:
              "Unable to check question number.",
          },
          500
        );
      }

      if (
        duplicateQuestion
      ) {
        return json(
          {
            error:
              `Question number ${questionNumber} already exists in this test.`,
          },
          409
        );
      }

      /* =====================================================
         UPDATE
      ===================================================== */

      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from(
            "mock_questions"
          )
          .update({

            question_number:
              questionNumber,

            question_text:
              String(
                body.question_text ||
                ""
              ).trim(),

            option_a:
              String(
                body.option_a ||
                ""
              ).trim(),

            option_b:
              String(
                body.option_b ||
                ""
              ).trim(),

            option_c:
              String(
                body.option_c ||
                ""
              ).trim(),

            option_d:
              String(
                body.option_d ||
                ""
              ).trim(),

            correct_option:
              correctOption,

            explanation:
              body.explanation
                ? String(
                    body.explanation
                  ).trim()
                : null,

            subject:
              body.subject
                ? String(
                    body.subject
                  ).trim()
                : null,

            topic:
              body.topic
                ? String(
                    body.topic
                  ).trim()
                : null,

            difficulty:
              body.difficulty ||
              "medium",

            /*
             * ALWAYS enforce
             * JPSC scoring.
             */
            marks: 2,

            negative_marks: 0,

            image_url:
              body.image_url
                ? String(
                    body.image_url
                  ).trim()
                : null,

            available_at:
              body.available_at ||
              null,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            questionId
          )
          .eq(
            "test_id",
            testId
          )
          .select("*")
          .single();

      if (error) {

        console.error(
          "Question update error:",
          error
        );

        return json(
          {
            error:
              error.message ||
              "Unable to update question.",
          },
          500
        );
      }

      return json(
        {
          success: true,

          message:
            "Question updated successfully.",

          question: data,
        }
      );

    } catch (error) {

      console.error(
        "PUT question error:",
        error
      );

      return json(
        {
          error:
            "Invalid request.",
        },
        400
      );
    }
  };

/* =========================================================
   DELETE — DELETE QUESTION
========================================================= */

export const DELETE: APIRoute =
  async ({
    params,
    request,
    cookies,
  }) => {

    /*
     * SECURITY:
     * Only administrator can delete questions.
     */
    const admin =
      await requireAdmin(
        cookies
      );

    if (!admin.authorized) {
      return admin.response;
    }

    const testId =
      getTestId(params);

    if (!testId) {
      return json(
        {
          error:
            "Invalid test ID.",
        },
        400
      );
    }

    try {

      const body =
        await request.json();

      const questionId =
        Number(
          body.id
        );

      if (
        !Number.isInteger(
          questionId
        ) ||
        questionId <= 0
      ) {
        return json(
          {
            error:
              "Valid question ID is required.",
          },
          400
        );
      }

      /* =====================================================
         VERIFY QUESTION BELONGS TO TEST
      ===================================================== */

      const {
        data: question,
        error: findError,
      } =
        await supabaseAdmin
          .from(
            "mock_questions"
          )
          .select(
            "id, test_id, question_number"
          )
          .eq(
            "id",
            questionId
          )
          .eq(
            "test_id",
            testId
          )
          .single();

      if (
        findError ||
        !question
      ) {
        return json(
          {
            error:
              "Question not found in this test.",
          },
          404
        );
      }

      /* =====================================================
         DELETE
      ===================================================== */

      const {
        error: deleteError,
      } =
        await supabaseAdmin
          .from(
            "mock_questions"
          )
          .delete()
          .eq(
            "id",
            questionId
          )
          .eq(
            "test_id",
            testId
          );

      if (deleteError) {

        console.error(
          "Question delete error:",
          deleteError
        );

        return json(
          {
            error:
              deleteError.message ||
              "Unable to delete question.",
          },
          500
        );
      }

      return json(
        {
          success: true,

          message:
            `Question ${question.question_number} deleted successfully.`,
        }
      );

    } catch (error) {

      console.error(
        "DELETE question error:",
        error
      );

      return json(
        {
          error:
            "Invalid request.",
        },
        400
      );
    }
  };