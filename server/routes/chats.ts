
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { and, eq } from "drizzle-orm";
import { db } from "@/adapter";
import { userTable } from "@/db/schemas/auth";
import { chatTable } from "@/db/schemas/chats";
import { v4 as uuidv4 } from "uuid";
import { redisChat } from "@/lib/redis-chat";



export const chatsRouter = new Hono()
  // Create
  .post(
    "/start-user-chat",
    zValidator("form", z.object({
      userId: z.string().min(1),
      otherUserId: z.string().min(1),
    })),
    async (c) => {
      const { userId, otherUserId } = c.req.valid("form");
  
      // Check if both users exist
      const [user1] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
      const [user2] = await db.select().from(userTable).where(eq(userTable.id, otherUserId)).limit(1);
      if (!user1 || !user2) {
        return c.json({ success: false, error: "One or both users not found" }, 404);
      }
  
      // Check if chat already exists (either direction)
      const [existingChat] = await db
        .select()
        .from(chatTable)
        .where(
          and(
            eq(chatTable.user1Id, userId),
            eq(chatTable.user2Id, otherUserId)
          )
        )
        .limit(1);
  
      if (existingChat) {
        return c.json({ success: true, chatId: existingChat.id, chat: existingChat });
      }
  
      // Check reverse direction
      const [reverseChat] = await db
        .select()
        .from(chatTable)
        .where(
          and(
            eq(chatTable.user1Id, otherUserId),
            eq(chatTable.user2Id, userId)
          )
        )
        .limit(1);
  
      if (reverseChat) {
        return c.json({ success: true, chatId: reverseChat.id, chat: reverseChat });
      }
  
      // Create new chat
      const chatId = uuidv4();
      const newChat = await db.insert(chatTable).values({
        id: chatId,
        user1Id: userId,
        user2Id: otherUserId,
      }).returning();
  
      return c.json({ success: true, chatId, chat: newChat });
    }
  )
  .post(
    "/send-message",
    zValidator("form", z.object({
      chatId: z.string().min(1),
      senderId: z.string().min(1),
      content: z.string().min(1),
    })),
    async (c) => {
      const { chatId, senderId, content } = c.req.valid("form");
  
      // Verify chat exists and sender is a participant
      const [chat] = await db
        .select()
        .from(chatTable)
        .where(eq(chatTable.id, chatId))
        .limit(1);
      if (!chat || (chat.user1Id !== senderId && chat.user2Id !== senderId)) {
        return c.json({ success: false, error: "Chat not found or unauthorized" }, 404);
      }
  
      const messageId = uuidv4();
      const message = {
        messageId,
        senderId,
        content,
        sentAt: new Date().toISOString(),
      };
  
      // Store in Redis (sorted key for uniqueness)
      const chatKey = `chat:${[chat.user1Id, chat.user2Id].sort().join(":")}`;
      await redisChat.lpush(chatKey, JSON.stringify(message));
      // Set expiry (e.g., 7 days) - optional
    //   await redisChat.expire(chatKey, 60 * 60 * 24 * 7);
  
      return c.json({ success: true, messageId, message });
    }
  )
  .get(
    "/chat-history/:userId/:otherUserId",
    zValidator("param", z.object({
      userId: z.string().min(1),
      otherUserId: z.string().min(1),
    })),
    async (c) => {
      const { userId, otherUserId } = c.req.valid("param");
  
      // Check if chat exists (either direction)
      const [chat] = await db
        .select()
        .from(chatTable)
        .where(
          and(
            eq(chatTable.user1Id, userId),
            eq(chatTable.user2Id, otherUserId)
          )
        )
        .limit(1);
  
      const [reverseChat] = await db
        .select()
        .from(chatTable)
        .where(
          and(
            eq(chatTable.user1Id, otherUserId),
            eq(chatTable.user2Id, userId)
          )
        )
        .limit(1);
  
      const chatId = chat?.id || reverseChat?.id;
      if (!chatId) {
        return c.json({ success: false, error: "Chat not found" }, 404);
      }
  
      // Get messages from Redis
      const chatKey = `chat:${[userId, otherUserId].sort().join(":")}`;

      console.log("chatKey>>>", chatKey)
      const messages = await redisChat.lrange(chatKey, 0, -1); // Get all messages

      console.log("messages>>>", messages)
      
      const orderedMessages = messages.reverse();
      return c.json({
        success: true,
        chatId,
        messages: orderedMessages,
      });
    }
  )