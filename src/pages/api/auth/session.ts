import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("PUBLIC_SUPABASE_URL is missing.");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
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

function jsonResponse(
  data: Record<string, unknown>,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}

export const POST: APIRoute =
  async ({ request, cookies }) => {
    try {
      let body: Record<string, unknown> = {};

      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          {
            success: false,
            message: "Invalid request body.",
          },
          400
        );
      }

      const accessToken =
        typeof body.accessToken === "string"
          ? body.accessToken.trim()
          : "";

      if (!accessToken) {
        return jsonResponse(
          {
            success: false,
            message: "Access token is required.",
          },
          401
        );
      }

      const {
        data,
        error,
      } = await supabaseAdmin.auth.getUser(
        accessToken
      );

      if (error || !data?.user) {
        return jsonResponse(
          {
            success: false,
            message: "Invalid or expired login session.",
          },
          401
        );
      }

      const isSecure =
        new URL(request.url).protocol === "https:";

      cookies.set(
        "habitat-access-token",
        accessToken,
        {
          httpOnly: true,
          secure: isSecure,
          sameSite: "lax",
          path: "/",
          maxAge: 3600,
        }
      );

      return jsonResponse({
        success: true,
        userId: data.user.id,
      });
    } catch (error) {
      console.error(
        "Session cookie API error:",
        error
      );

      return jsonResponse(
        {
          success: false,
          message: "Unable to establish server session.",
        },
        500
      );
    }
  };

export const DELETE: APIRoute =
  async ({ cookies }) => {
    cookies.delete(
      "habitat-access-token",
      { path: "/" }
    );

    return jsonResponse({
      success: true,
    });
  };
