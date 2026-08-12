import { describe, expect, it } from "vitest";
import { buildBot } from "../src/bot";
import { runSpec } from "../src/toolkit/harness/runner";

describe("owner start menu", () => {
  it("shows the configured owner one View leads shortcut and opens the owner inbox", async () => {
    const previousAdminId = process.env.ADMIN_CHAT_ID;
    process.env.ADMIN_CHAT_ID = "77";

    try {
      const result = await runSpec(
        await buildBot("123456:TEST"),
        {
          name: "configured owner can use the start shortcut",
          steps: [
            {
              send: { text: "/start", chatId: 77, userId: 77 },
              expect: [
                {
                  method: "sendMessage",
                  payload: {
                    reply_markup: {
                      inline_keyboard: [[{ text: "View leads", callback_data: "view_leads" }]],
                    },
                  },
                },
              ],
            },
            {
              send: { callback: "view_leads", chatId: 77, userId: 77 },
              expect: [
                {
                  method: "editMessageText",
                  payload: { text: "Lead storage isn't available yet." },
                },
              ],
            },
          ],
        },
      );

      expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);
    } finally {
      if (previousAdminId === undefined) delete process.env.ADMIN_CHAT_ID;
      else process.env.ADMIN_CHAT_ID = previousAdminId;
    }
  });
});
