import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";

import { db } from "@/adapter";
// import type { Context } from "@/context";
import { userTable } from "@/db/schemas/auth";
// import { lucia } from "@/lucia";
// import { loggedIn } from "@/middleware/loggedIn";
import { zValidator } from "@hono/zod-validator";
import { generateId } from "lucia";
import postgres from "postgres";
import { z } from "zod";

import {
  loginSchema,
  // type SuccessResponse
} from "@/lib/types";

export const authRouter = new Hono()
  //signup
  .post("/signup", zValidator("form", loginSchema), async (c) => {
    const { username, password } = c.req.valid("form");

    console.log("username>>>>", username);
    console.log("password>>>>", password);

    const passwordHash = await Bun.password.hash(password);
    const userId = generateId(15);
    const randname = generateId(6);

    try {
      const user = await db
        .insert(userTable)
        .values({
          id: userId,
          username,
          randname,
          password_hash: passwordHash,
        })
        .returning();

      // const session = await lucia.createSession(userId, { username });
      // const sessionCookie = lucia.createSessionCookie(session.id).serialize();

      // c.header("Set-Cookie", sessionCookie, { append: true });

      return c.json(
        {
          success: true,
          message: "User created",
          data: { user }, // Return userId for client use
        },
        201,
      );
    } catch (error) {
      if (error instanceof postgres.PostgresError && error.code === "23505") {
        throw new HTTPException(409, {
          message: "Username already used",
          cause: { form: true },
        });
      }
      throw new HTTPException(500, { message: "Failed to create user" });
    }
  })
  //login
  .post("/login", zValidator("form", loginSchema), async (c) => {
    const { username, password } = c.req.valid("form");
    console.log(username, password);
    console.log("username>>>>", username);
    console.log("password>>>>", password);

    const [existingUser] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.username, username))
      .limit(1);

    if (!existingUser) {
      throw new HTTPException(401, {
        message: "Incorrect username",
        cause: { form: true },
      });
    }

    const validPassword = await Bun.password.verify(
      password,
      existingUser.password_hash,
    );
    if (!validPassword) {
      throw new HTTPException(401, {
        message: "Incorrect password",
        cause: { form: true },
      });
    }

    // const session = await lucia.createSession(existingUser.id, { username });
    // const sessionCookie = lucia.createSessionCookie(session.id).serialize();

    // c.header("Set-Cookie", sessionCookie, { append: true });

    return c.json(
      {
        success: true,
        message: "Logged in",
        data: { user: existingUser }, // Return userId for client use
      },
      200,
    );
  })
  //no logout route as meaningless
  // .get("/logout", async (c) => {
  //   const session = c.get("session");
  //   if (!session) {
  //     return c.redirect("/");
  //   }

  //   await lucia.invalidateSession(session.id);
  //   c.header("Set-Cookie", lucia.createBlankSessionCookie().serialize());
  //   return c.redirect("/");
  // })
  //get user by id
  .get(
    "/:id",
    zValidator("param", z.object({ id: z.coerce.string() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const [existingUser] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, id))
        .limit(1);

      if (!existingUser) {
        throw new HTTPException(401, {
          message: "user doesn't exist",
          cause: { form: true },
        });
      }

      // const user = c.get("user")!;
      return c.json({
        success: true,
        message: "User fetched",
        data: { user: existingUser },
      });
    },
  )
  // Add this to your existing authRouter chain
  .put(
    "/:id",
    zValidator("param", z.object({ id: z.coerce.string() })),
    zValidator("form", loginSchema.partial()),
    async (c) => {
      const { id } = c.req.valid("param");
      const data = c.req.valid("form");

      // Check if user exists
      const [existingUser] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, id))
        .limit(1);

      if (!existingUser) {
        throw new HTTPException(404, {
          message: "User not found",
          cause: { form: true },
        });
      }

      // Prepare update data
      const updateData: Partial<typeof userTable.$inferInsert> = {};

      if (data.username) {
        updateData.username = data.username;
      }

      if (data.randname) {
        updateData.randname = data.randname;
      }

      if (data.password) {
        updateData.password_hash = await Bun.password.hash(data.password);
      }

      // If no data to update, return early
      if (Object.keys(updateData).length === 0) {
        throw new HTTPException(400, {
          message: "No update data provided",
          cause: { form: true },
        });
      }

      try {
        const [updatedUser] = await db
          .update(userTable)
          .set(updateData)
          .where(eq(userTable.id, id))
          .returning();

        return c.json(
          {
            success: true,
            message: "User updated successfully",
            data: { user: updatedUser },
          },
          200,
        );
      } catch (error) {
        if (error instanceof postgres.PostgresError && error.code === "23505") {
          throw new HTTPException(409, {
            message: "Username already taken",
            cause: { form: true },
          });
        }
        throw new HTTPException(500, {
          message: "Failed to update user",
        });
      }
    },
  );
