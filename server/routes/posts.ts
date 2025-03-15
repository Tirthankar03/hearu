import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, countDistinct, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/adapter";
// import { type Context } from "@/context";
import { userTable } from "@/db/schemas/auth";
import { commentsTable } from "@/db/schemas/comments";
import { postsTable } from "@/db/schemas/posts";
import { commentUpvotesTable, postUpvotesTable } from "@/db/schemas/upvotes";
// import { loggedIn } from "@/middleware/loggedIn";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  createCommentSchema,
  createPostSchema,
  paginationSchema,
  type Comment,
  type PaginatedResponse,
  type Post,
  type SuccessResponse,
} from "@/lib/types";
import { getISOFormatDateQuery } from "@/lib/utils";

export const postRouter = new Hono()
  //create a new post
  .post("/", zValidator("form", createPostSchema), async (c) => {
    const { title, url, content, userId } = c.req.valid("form");
    // const user = c.get("user")!;

    console.log("title>>>>", title);
    console.log("url>>>>", url);
    console.log("content>>>>", content);
    console.log("userId>>>>>", userId);

    const [existingUser] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!existingUser) {
      throw new HTTPException(401, {
        message: "user doesn't exist",
        cause: { form: true },
      });
    }
    const [post] = await db
      .insert(postsTable)
      .values({
        title,
        content,
        url,
        // userId: user.id,
        userId: existingUser.id,
      })
      .returning();
    return c.json(
      {
        success: true,
        message: "Post created",
        data: { post },
      },
      201,
    );
  })
  //post pagination
  .get("/", zValidator("query", paginationSchema), async (c) => {
    const { limit, page, sortBy, order, author, site, userId } =
      c.req.valid("query");
    // const user = c.get("user");

    // const [existingUser] = await db
    // .select()
    // .from(userTable)
    // .where(eq(userTable.id, userId))
    // .limit(1);

    // if (!existingUser) {
    //   throw new HTTPException(401, {
    //     message: "user doesn't exist",
    //     cause: { form: true },
    //   });
    // }

    const offset = (page - 1) * limit;

    const sortByColumn =
      sortBy === "points" ? postsTable.points : postsTable.createdAt;
    const sortOrder = order === "desc" ? desc(sortByColumn) : asc(sortByColumn);

    const [count] = await db
      .select({ count: countDistinct(postsTable.id) })
      .from(postsTable)
      .where(
        and(
          author ? eq(postsTable.userId, author) : undefined,
          site ? eq(postsTable.url, site) : undefined,
        ),
      );

    const postsQuery = db
      .select({
        id: postsTable.id,
        title: postsTable.title,
        url: postsTable.url,
        content: postsTable.content,
        points: postsTable.points,
        createdAt: getISOFormatDateQuery(postsTable.createdAt),
        commentCount: postsTable.commentCount,
        author: {
          username: userTable.username,
          id: userTable.id,
        },
        // isUpvoted: user
        // isUpvoted: existingUser
        //SUPER ULTRA DOUBT!!!!!!!!
        isUpvoted: userId
          ? sql<boolean>`CASE WHEN ${postUpvotesTable.userId} IS NOT NULL THEN true ELSE false END`
          : sql<boolean>`false`,
      })
      .from(postsTable)
      .leftJoin(userTable, eq(postsTable.userId, userTable.id))
      .orderBy(sortOrder)
      .limit(limit)
      .offset(offset)
      .where(
        and(
          author ? eq(postsTable.userId, author) : undefined,
          site ? eq(postsTable.url, site) : undefined,
        ),
      );

    if (userId) {
      postsQuery.leftJoin(
        postUpvotesTable,
        and(
          eq(postUpvotesTable.postId, postsTable.id),
          eq(postUpvotesTable.userId, userId),
        ),
      );
    }

    const posts = await postsQuery;

    return c.json<PaginatedResponse<Post[]>>(
      {
        data: posts as Post[],
        success: true,
        message: "Posts fetched",
        pagination: {
          page: page,
          totalPages: Math.ceil(count.count / limit) as number,
        },
      },
      200,
    );
  })
  //post upvote?
  .post(
    "/:id/:userId/upvote",
    // loggedIn,
    zValidator(
      "param",
      z.object({ id: z.coerce.number(), userId: z.string().min(1) }),
    ),
    async (c) => {
      const { id, userId } = c.req.valid("param");
      // const user = c.get("user")!;
      // const { userId } = c.req.valid("json");
      let pointsChange: -1 | 1 = 1;

      const points = await db.transaction(async (tx) => {
        const [existingUpvote] = await tx
          .select()
          .from(postUpvotesTable)
          .where(
            and(
              eq(postUpvotesTable.postId, id),
              eq(postUpvotesTable.userId, userId),
            ),
          )
          .limit(1);

        pointsChange = existingUpvote ? -1 : 1;

        const [updated] = await tx
          .update(postsTable)
          .set({ points: sql`${postsTable.points} + ${pointsChange}` })
          .where(eq(postsTable.id, id))
          .returning({ points: postsTable.points });

        if (!updated) {
          throw new HTTPException(404, { message: "Post not found" });
        }

        if (existingUpvote) {
          await tx
            .delete(postUpvotesTable)
            .where(eq(postUpvotesTable.id, existingUpvote.id));
        } else {
          await tx.insert(postUpvotesTable).values({ postId: id, userId });
        }

        return updated.points;
      });

      return c.json<SuccessResponse<{ count: number; isUpvoted: boolean }>>(
        {
          success: true,
          message: "Post updated",
          data: { count: points, isUpvoted: pointsChange > 0 },
        },
        200,
      );
    },
  )

  //create top level comment (add userId in the body) //as there are two POST comment route, which one is supposed to use and when?
  .post(
    "/:id/comment",
    // loggedIn,
    zValidator("param", z.object({ id: z.coerce.number() })),
    zValidator("form", createCommentSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const { content, userId } = c.req.valid("form");
      // const user = c.get("user")!;

      const [existingUser] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

      if (!existingUser) {
        throw new HTTPException(401, {
          message: "user doesn't exist",
          cause: { form: true },
        });
      }

      const [comment] = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(postsTable)
          .set({ commentCount: sql`${postsTable.commentCount} + 1` })
          .where(eq(postsTable.id, id))
          .returning({ commentCount: postsTable.commentCount });

        if (!updated) {
          throw new HTTPException(404, {
            message: "Post not found",
          });
        }

        return await tx
          .insert(commentsTable)
          .values({
            content,
            userId: existingUser.id,
            postId: id,
          })
          .returning({
            id: commentsTable.id,
            userId: commentsTable.userId,
            postId: commentsTable.postId,
            content: commentsTable.content,
            points: commentsTable.points,
            depth: commentsTable.depth,
            parentCommentId: commentsTable.parentCommentId,
            createdAt: getISOFormatDateQuery(commentsTable.createdAt).as(
              "created_at",
            ),
            commentCount: commentsTable.commentCount,
          });
      });
      return c.json<SuccessResponse<Comment>>({
        success: true,
        message: "Comment created",
        data: {
          ...comment,
          commentUpvotes: [],
          childComments: [],
          author: {
            username: existingUser.username,
            id: existingUser.id,
          },
        } as Comment,
      });
    },
  )
  //get comments along with children if specified //when to use includeChildren, why is it specified?
  .get(
    "/:id/comments",
    zValidator("param", z.object({ id: z.coerce.number() })),
    zValidator(
      "query",
      paginationSchema.extend({
        includeChildren: z.boolean({ coerce: true }).optional(),
      }),
    ),
    async (c) => {
      // const user = c.get("user");
      const { id } = c.req.valid("param");
      const { limit, page, sortBy, order, includeChildren, userId } =
        c.req.valid("query");

      // const [existingUser] = await db
      // .select()
      // .from(userTable)
      // .where(eq(userTable.id, userId))
      // .limit(1);

      // if (!existingUser) {
      //   throw new HTTPException(401, {
      //     message: "user doesn't exist",
      //     cause: { form: true },
      //   });
      // }
      // Initialize existingUser as null
      let existingUser = null;

      // Only fetch the user if userId is provided
      if (userId) {
        [existingUser] = await db
          .select()
          .from(userTable)
          .where(eq(userTable.id, userId))
          .limit(1);

        if (!existingUser) {
          throw new HTTPException(401, {
            message: "user doesn't exist",
            cause: { form: true },
          });
        }
      }

      const offset = (page - 1) * limit;

      const [postExists] = await db
        .select({ exists: sql`1` })
        .from(postsTable)
        .where(eq(postsTable.id, id))
        .limit(1);

      if (!postExists) {
        throw new HTTPException(404, { message: "Post not found" });
      }

      const sortByColumn =
        sortBy === "points" ? commentsTable.points : commentsTable.createdAt;

      const sortOrder =
        order === "desc" ? desc(sortByColumn) : asc(sortByColumn);

      console.log(sortBy, order);

      const [count] = await db
        .select({ count: countDistinct(commentsTable.id) })
        .from(commentsTable)
        .where(
          and(
            eq(commentsTable.postId, id),
            isNull(commentsTable.parentCommentId),
          ),
        );

      const comments = await db.query.comments.findMany({
        where: and(
          eq(commentsTable.postId, id),
          isNull(commentsTable.parentCommentId),
        ),
        orderBy: sortOrder,
        limit: limit,
        offset: offset,
        with: {
          author: {
            columns: {
              username: true,
              id: true,
            },
          },
          commentUpvotes: {
            columns: { userId: true },
            // where: eq(commentUpvotesTable.userId, existingUser?.id ?? ""),
            // Only filter upvotes if existingUser exists
            // where: existingUser ? eq(commentUpvotesTable.userId, existingUser.id) : undefined,
            where: eq(commentUpvotesTable.userId, userId ?? ""),
            limit: 1,
          },
          childComments: {
            limit: includeChildren ? 2 : 0,
            with: {
              author: {
                columns: {
                  username: true,
                  id: true,
                },
              },
              commentUpvotes: {
                columns: { userId: true },
                // where: eq(commentUpvotesTable.userId, existingUser?.id ?? ""),
                // Only filter upvotes if existingUser exists
                // where: existingUser ? eq(commentUpvotesTable.userId, existingUser.id) : undefined,
                where: eq(commentUpvotesTable.userId, userId ?? ""),
                limit: 1,
              },
            },
            orderBy: sortOrder,
            extras: {
              createdAt: getISOFormatDateQuery(commentsTable.createdAt).as(
                "created_at",
              ),
            },
          },
        },
        extras: {
          createdAt: getISOFormatDateQuery(commentsTable.createdAt).as(
            "created_at",
          ),
        },
      });

      return c.json<PaginatedResponse<Comment[]>>(
        {
          success: true,
          message: "Comments fetched",
          data: comments as Comment[],
          pagination: {
            page,
            totalPages: Math.ceil(count.count / limit) as number,
          },
        },
        200,
      );
    },
  )
  //get a post
  .get(
    "/:id/:userId",
    zValidator(
      "param",
      z.object({ id: z.coerce.number(), userId: z.string().min(1) }),
    ),
    async (c) => {
      // const user = c.get("user");

      const { id, userId } = c.req.valid("param");

      console.log(id, userId);

      const postsQuery = db
        .select({
          id: postsTable.id,
          title: postsTable.title,
          url: postsTable.url,
          points: postsTable.points,
          content: postsTable.content,
          createdAt: getISOFormatDateQuery(postsTable.createdAt),
          commentCount: postsTable.commentCount,
          author: {
            username: userTable.username,
            id: userTable.id,
          },
          isUpvoted: userId
            ? sql<boolean>`CASE WHEN ${postUpvotesTable.userId} IS NOT NULL THEN true ELSE false END`
            : sql<boolean>`false`,
        })
        .from(postsTable)
        .leftJoin(userTable, eq(postsTable.userId, userTable.id))
        .where(eq(postsTable.id, id));

      if (userId) {
        postsQuery.leftJoin(
          postUpvotesTable,
          and(
            eq(postUpvotesTable.postId, postsTable.id),
            eq(postUpvotesTable.userId, userId),
          ),
        );
      }

      const [post] = await postsQuery;
      if (!post) {
        throw new HTTPException(404, { message: "Post not found" });
      }
      return c.json<SuccessResponse<Post>>(
        {
          success: true,
          message: "Post Fetched",
          data: post as Post,
        },
        200,
      );
    },
  )
  .get("/daily", async (c) => {
    return c.json(
      {
        success: true,
        message: "Post Fetched",
        data: {
          Morning: [
            {
              id: 1,
              section: "Morning",
              category: "Breath",
              isCompleted: false,
              audio: {
                id: 2,
                category: "Breath",
                title: "Deep Breathing Exercise",
                url: "https://res.cloudinary.com/dlsh6g7cz/video/upload/v1741206310/audio_uploads/jb2bz29or7bvwxizwhdt.m4a",
                duration: "7 mins",
              },
              article: null,
            },
            {
              id: 2,
              section: "Morning",
              category: "Articles",
              isCompleted: false,
              audio: null,
              article: {
                id: 3,
                title: "Why self love is important",
                imageUrl:
                  "https://img.freepik.com/free-photo/unrecognizable-woman-showing-heart-gesture_23-2147829758.jpg",
                content:
                  "Self-love is the foundation of a healthy and fulfilling life. It starts with the way you speak to yourself—choosing words of encouragement and kindness instead of self-criticism. Its about spending quality time alone, allowing yourself to reflect, recharge, and enjoy your own company without distraction. Taking care of your well-being also means making choices that serve you, whether it's setting boundaries, eating nourishing food, or creating a space that brings you comfort and peace. Self-love is found in the small joys, like treating yourself to something special, embracing your passions, or simply allowing yourself to rest without guilt. It also extends to your physical well-being—moving your body, practicing mindfulness, and engaging in activities that make you feel strong and connected. When you make self-care a priority, you cultivate a deeper sense of worth, resilience, and inner peace. Its not about being perfect, but about embracing yourself fully, flaws and all. The more you practice self-love, the more you realize that your happiness and well-being are worth the time, effort, and care you invest in yourself.",
              },
            },
          ],
          Day: [
            {
              id: 3,
              section: "Day",
              category: "Meditation",
              isCompleted: false,
              audio: {
                id: 5,
                category: "Meditation",
                title: "Morning Affirmations",
                url: "https://res.cloudinary.com/dlsh6g7cz/video/upload/v1741207009/audio_uploads/eovfzwiwweyei9aiprdr.m4a",
                duration: "4 mins",
              },
              article: null,
            },
          ],
          Evening: [
            {
              id: 4,
              section: "Evening",
              category: "Sleep Stories",
              isCompleted: false,
              audio: {
                id: 7,
                category: "Sleep Stories",
                title: "Goodnight Ocean",
                url: "https://res.cloudinary.com/dlsh6g7cz/video/upload/v1741207239/audio_uploads/pairguwgdeyin0auoeig.m4a",
                duration: "5 mins",
              },
              article: null,
            },
            {
              id: 5,
              section: "Evening",
              category: "Sleep Sounds",
              isCompleted: false,
              audio: {
                id: 9,
                category: "Sleep Sounds",
                title: "Binural beats",
                url: "https://res.cloudinary.com/dlsh6g7cz/video/upload/v1741207380/audio_uploads/vcvsiscugn8k3pcjwrbc.m4a",
                duration: "5 mins",
              },
              article: null,
            },
          ],
        },
      },
      200,
    );
  })
  .delete(
    "/:id/:userId",
    zValidator(
      "param",
      z.object({
        id: z.coerce.number(),
        userId: z.string().min(1),
      }),
    ),
    async (c) => {
      const { id, userId } = c.req.valid("param");

      const [existingUser] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

      if (!existingUser) {
        throw new HTTPException(401, {
          message: "User doesn't exist",
        });
      }

      const [deleted] = await db
        .delete(postsTable)
        .where(and(eq(postsTable.id, id), eq(postsTable.userId, userId)))
        .returning();

      if (!deleted) {
        throw new HTTPException(404, {
          message: "Post not found or you don't have permission",
        });
      }

      return c.json<SuccessResponse<null>>(
        {
          success: true,
          message: "Post deleted successfully",
          data: null,
        },
        200,
      );
    },
  )
  .delete(
    "/:id/:userId",
    zValidator(
      "param",
      z.object({
        id: z.coerce.number(),
        userId: z.string().min(1),
      }),
    ),
    async (c) => {
      const { id, userId } = c.req.valid("param");

      const [existingUser] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

      if (!existingUser) {
        throw new HTTPException(401, {
          message: "User doesn't exist",
        });
      }

      const [deleted] = await db
        .delete(postsTable)
        .where(and(eq(postsTable.id, id), eq(postsTable.userId, userId)))
        .returning();

      if (!deleted) {
        throw new HTTPException(404, {
          message: "Post not found or you don't have permission",
        });
      }

      return c.json<SuccessResponse<null>>(
        {
          success: true,
          message: "Post deleted successfully",
          data: null,
        },
        200,
      );
    },
  );
