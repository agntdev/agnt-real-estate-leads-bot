import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  isOwner,
  mainMenuKeyboard,
} from "../toolkit/index.js";

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

const WELCOME = "Share your property plans and an agent will contact you. Tap 'Submit request' to begin.";

function startKeyboard(ctx: Ctx) {
  if (isOwner(ctx)) {
    return inlineKeyboard([[inlineButton("View leads", "view_leads")]]);
  }
  return mainMenuKeyboard();
}

composer.command("start", async (ctx) => {
  await ctx.reply(WELCOME, { reply_markup: startKeyboard(ctx) });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: startKeyboard(ctx) });
});

export default composer;
