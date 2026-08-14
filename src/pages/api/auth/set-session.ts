import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

/*
=========================================================
HABITAT IAS
AUTH SESSION COOKIE

Purpose:
Convert the Supabase browser access token into the
server-readable HttpOnly cookie used by protected pages.

Cookie:
habitat-access-token
=========================================================
*/

const SUPABASE_URL =
  import.meta.env.PUBLIC_SUPABASE_URL;

const SUPABASE_ANON_KEY =
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    "PUBLIC_SUPABASE_URL is missing."
  );
}

if (!SUPABASE_ANON_KEY) {
  throw new Error(
    "PUBLIC_SUPABASE_ANON_KEY is missing."
  );
}


/*
=========================================================
POST
=========================================================
*/

export const POST: APIRoute =
  async ({ request, cookies }) => {

    try {

      /*
      -----------------------------------------------------
      1. READ REQUEST
      -----------------------------------------------------
      */

      let body: {
        accessToken?: string;
      } = {};

      try {

        body =
          await request.json();

      } catch {

        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Invalid request body."
          }),
          {
            status: 400,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );

      }


      /*
      -----------------------------------------------------
      2. ACCESS TOKEN
      -----------------------------------------------------
      */

      const accessToken =
        typeof body.accessToken === "string"
          ? body.accessToken.trim()
          : "";


      if (!accessToken) {

        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Access token is required."
          }),
          {
            status: 400,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );

      }


      /*
      -----------------------------------------------------
      3. VERIFY TOKEN WITH SUPABASE
      -----------------------------------------------------
      */

      const supabase =
        createClient(
          SUPABASE_URL,
          SUPABASE_ANON_KEY,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false
            }
          }
        );


      const {
        data,
        error
      } =
        await supabase.auth.getUser(
          accessToken
        );


      if (
        error ||
        !data?.user
      ) {

        console.error(
          "[AUTH COOKIE] Token verification failed:",
          error
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Invalid or expired login session."
          }),
          {
            status: 401,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );

      }


      /*
      -----------------------------------------------------
      4. CREATE SERVER COOKIE
      -----------------------------------------------------
      */

      cookies.set(
        "habitat-access-token",
        accessToken,
        {
          httpOnly: true,

          secure:
            import.meta.env.PROD,

          sameSite: "lax",

          path: "/",

          /*
           * Supabase access tokens normally have a
           * limited lifetime. Keep the cookie aligned
           * with the active login session.
           */
          maxAge: 60 * 60
        }
      );


      /*
      -----------------------------------------------------
      5. SUCCESS
      -----------------------------------------------------
      */

      return new Response(
        JSON.stringify({
          success: true,
          userId:
            data.user.id
        }),
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/json",
            "Cache-Control":
              "no-store"
          }
        }
      );

    } catch (error) {

      console.error(
        "[AUTH COOKIE] Unexpected error:",
        error
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Unable to create login session."
        }),
        {
          status: 500,
          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );

    }

  };