import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  adminChatId,
  getLead,
  inlineButton,
  inlineKeyboard,
  isOwner,
  listLeads,
  registerMainMenuItem,
  requireOwner,
  saveLead,
  setLeadStatus,
  type Lead,
  type LeadIntent,
  type LeadStatus,
  type LeadStoreEnv,
  type OwnerAwareCtx,
} from "../toolkit/index.js";

registerMainMenuItem({ label: "Submit a lead", data: "lead:start", order: 10 });

const composer = new Composer<Ctx>();
const FLOW_TTL_MS = 5 * 60 * 1000;

// One clock seam keeps timestamps and expiry checks deterministic when tested.
let clock: () => number = () => Date.now();
export function setLeadClockForTesting(next: (() => number) | undefined): void {
  clock = next ?? (() => Date.now());
}
function now(): number {
  return clock();
}

function envOf(ctx: Ctx): LeadStoreEnv | undefined {
  return (ctx as unknown as { env?: LeadStoreEnv }).env;
}

function requireLeadOwner(ctx: Ctx): Promise<boolean> {
  return requireOwner(ctx as unknown as OwnerAwareCtx);
}

function clearDraft(ctx: Ctx): void {
  ctx.session.step = "idle";
  ctx.session.leadDraft = undefined;
  ctx.session.leadExpiresAt = undefined;
}

function startDraft(ctx: Ctx): void {
  ctx.session.step = "name";
  ctx.session.leadDraft = {};
}

function flowExpired(ctx: Ctx): boolean {
  const expiry = ctx.session.leadExpiresAt;
  return expiry !== undefined && now() > expiry;
}

function refreshExpiry(ctx: Ctx): void {
  ctx.session.leadExpiresAt = now() + FLOW_TTL_MS;
}

function escapeText(value: string): string {
  return value.replace(/[<>]/g, "").trim();
}

function validName(value: string): boolean {
  return value.length >= 2 && value.length <= 80;
}

function normalizePhone(value: string): string | undefined {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,15}$/.test(compact)) return undefined;
  return compact.startsWith("+") ? compact : `+${compact}`;
}

function draftComplete(ctx: Ctx): ctx is Ctx & { session: { leadDraft: Required<NonNullable<Ctx["session"]["leadDraft"]>> } } {
  const draft = ctx.session.leadDraft;
  return Boolean(draft?.name && draft.phone && draft.intent && draft.note);
}

function summary(draft: Required<NonNullable<Ctx["session"]["leadDraft"]>>): string {
  return `Please confirm your details:\n\nName: ${draft.name}\nPhone: ${draft.phone}\nIntent: ${draft.intent}\nNote: ${draft.note}`;
}

function intentKeyboard() {
  return inlineKeyboard([
    [inlineButton("Buy", "lead:intent:buy"), inlineButton("Rent", "lead:intent:rent")],
    [inlineButton("Sell", "lead:intent:sell")],
    [inlineButton("Cancel", "lead:cancel")],
  ]);
}

function confirmationKeyboard() {
  return inlineKeyboard([
    [inlineButton("Confirm", "lead:confirm"), inlineButton("Start over", "lead:restart")],
    [inlineButton("Cancel", "lead:cancel")],
  ]);
}

function backKeyboard() {
  return inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);
}

function leadDetails(lead: Lead): string {
  return `Lead details\n\nName: ${lead.name}\nPhone: ${lead.phone}\nIntent: ${lead.intent}\nNote: ${lead.note}\nStatus: ${lead.status}`;
}

function detailKeyboard(lead: Lead, page: number) {
  const target: LeadStatus = lead.status === "Done" ? "New" : "Done";
  return inlineKeyboard([
    [inlineButton(`Mark ${target}`, `lead:status:${lead.id}:${target.toLowerCase()}`)],
    [inlineButton("Back to leads", `lead:list:${page}`)],
  ]);
}

async function showList(ctx: Ctx, page: number, edit: boolean): Promise<void> {
  const result = await listLeads(envOf(ctx), page, 10);
  if (!result) {
    const text = "Lead storage isn't available yet.";
    if (edit) await ctx.editMessageText(text, { reply_markup: backKeyboard() });
    else await ctx.reply(text, { reply_markup: backKeyboard() });
    return;
  }
  if (result.total === 0) {
    const text = "No leads yet — submitted enquiries will appear here.";
    if (edit) await ctx.editMessageText(text, { reply_markup: backKeyboard() });
    else await ctx.reply(text, { reply_markup: backKeyboard() });
    return;
  }
  const pageCount = Math.ceil(result.total / 10);
  const rows = result.leads.map((lead, index) =>
    inlineButton(`Open lead ${page * 10 + index + 1}`, `lead:detail:${lead.id}:${page}`),
  );
  const keyboardRows = [] as ReturnType<typeof inlineKeyboard>["inline_keyboard"];
  for (let i = 0; i < rows.length; i += 2) keyboardRows.push(rows.slice(i, i + 2));
  const nav = [] as typeof rows;
  if (page > 0) nav.push(inlineButton("Previous", `lead:list:${page - 1}`));
  if (page + 1 < pageCount) nav.push(inlineButton("Next", `lead:list:${page + 1}`));
  if (nav.length) keyboardRows.push(nav);
  keyboardRows.push([inlineButton("Back to menu", "menu:main")]);
  const text = `Leads ${page * 10 + 1}–${page * 10 + result.leads.length} of ${result.total}\n\n${result.leads
    .map((lead, index) => `${page * 10 + index + 1}. ${lead.name} — ${lead.intent} — ${lead.status}`)
    .join("\n")}`;
  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(keyboardRows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(keyboardRows) });
}

async function showDetail(ctx: Ctx, id: string, page: number): Promise<void> {
  const lead = await getLead(envOf(ctx), id);
  if (!lead) {
    await ctx.editMessageText("That lead is no longer available.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to leads", `lead:list:${page}`)]]),
    });
    return;
  }
  await ctx.editMessageText(leadDetails(lead), { reply_markup: detailKeyboard(lead, page) });
}

composer.command("leads", async (ctx) => {
  if (!(await requireLeadOwner(ctx))) return;
  await showList(ctx, 0, false);
});

// Owners see this shortcut on /start. Keep it on the same renderer as /leads
// so pagination, details, and status controls always behave identically.
composer.callbackQuery("view_leads", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireLeadOwner(ctx))) return;
  await showList(ctx, 0, true);
});

composer.callbackQuery("lead:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  startDraft(ctx);
  refreshExpiry(ctx);
  await ctx.editMessageText("Share your full name.", {
    reply_markup: inlineKeyboard([[inlineButton("Cancel", "lead:cancel")]]),
  });
});

composer.callbackQuery(/^lead:intent:(buy|rent|sell)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.session.step !== "phone" && ctx.session.step !== "note") {
    await ctx.editMessageText("Start a new enquiry from the menu.", { reply_markup: backKeyboard() });
    return;
  }
  const selected = ctx.match[1];
  const intent: LeadIntent = selected[0].toUpperCase() + selected.slice(1) as LeadIntent;
  ctx.session.leadDraft = { ...ctx.session.leadDraft, intent };
  ctx.session.step = "note";
  refreshExpiry(ctx);
  await ctx.editMessageText("Add a short note about what you need.", {
    reply_markup: inlineKeyboard([[inlineButton("Cancel", "lead:cancel")]]),
  });
});

composer.callbackQuery("lead:restart", async (ctx) => {
  await ctx.answerCallbackQuery();
  startDraft(ctx);
  refreshExpiry(ctx);
  await ctx.editMessageText("Share your full name.", {
    reply_markup: inlineKeyboard([[inlineButton("Cancel", "lead:cancel")]]),
  });
});

composer.callbackQuery("lead:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearDraft(ctx);
  await ctx.editMessageText("Your enquiry was cancelled.", { reply_markup: backKeyboard() });
});

composer.callbackQuery("lead:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!draftComplete(ctx)) {
    clearDraft(ctx);
    await ctx.editMessageText("Your draft has expired. Start again from the menu.", { reply_markup: backKeyboard() });
    return;
  }
  const draft = ctx.session.leadDraft;
  const lead: Lead = {
    id: crypto.randomUUID(),
    submitter_telegram_id: ctx.from?.id,
    name: draft.name,
    phone: draft.phone,
    intent: draft.intent,
    note: draft.note,
    status: "New",
    timestamp: new Date(now()).toISOString(),
  };
  try {
    if (!(await saveLead(envOf(ctx), lead))) {
      await ctx.editMessageText("Your enquiry couldn't be saved. Please try again shortly.", { reply_markup: confirmationKeyboard() });
      return;
    }
  } catch {
    await ctx.editMessageText("Your enquiry couldn't be saved. Please try again shortly.", { reply_markup: confirmationKeyboard() });
    return;
  }
  clearDraft(ctx);
  await ctx.editMessageText("Your enquiry has been sent. The agent will be in touch.", { reply_markup: backKeyboard() });
  const owner = adminChatId(ctx as unknown as { env?: Record<string, unknown> });
  if (owner) {
    try {
      await ctx.api.sendMessage(owner, `New real estate lead\n\n${leadDetails(lead)}`);
    } catch {
      // A blocked or unavailable owner must not undo a successfully saved lead.
    }
  }
});

composer.callbackQuery(/^lead:list:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireLeadOwner(ctx))) return;
  await showList(ctx, Number(ctx.match[1]), true);
});

composer.callbackQuery(/^lead:detail:([0-9a-f-]{36}):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireLeadOwner(ctx))) return;
  await showDetail(ctx, ctx.match[1], Number(ctx.match[2]));
});

composer.callbackQuery(/^lead:status:([0-9a-f-]{36}):(new|done)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireLeadOwner(ctx))) return;
  const id = ctx.match[1];
  const status: LeadStatus = ctx.match[2] === "new" ? "New" : "Done";
  const existing = await getLead(envOf(ctx), id);
  if (!existing) {
    await ctx.editMessageText("That lead is no longer available.", { reply_markup: backKeyboard() });
    return;
  }
  if (existing.status === status) {
    await ctx.editMessageText(`This lead is already marked ${status}.`, {
      reply_markup: detailKeyboard(existing, 0),
    });
    return;
  }
  const updated = await setLeadStatus(envOf(ctx), id, status);
  if (!updated) {
    await ctx.editMessageText("The lead status couldn't be updated. Try again shortly.", {
      reply_markup: detailKeyboard(existing, 0),
    });
    return;
  }
  await ctx.editMessageText(`Lead marked ${status}.`, { reply_markup: detailKeyboard(updated, 0) });
});

composer.on("message:contact", async (ctx, next) => {
  if (ctx.session.step !== "phone") return next();
  const phone = normalizePhone(ctx.message.contact.phone_number);
  if (!phone) {
    await ctx.reply("That phone number isn't valid. Send a number with at least seven digits.");
    return;
  }
  ctx.session.leadDraft = { ...ctx.session.leadDraft, phone };
  refreshExpiry(ctx);
  await ctx.reply("Choose the type of enquiry.", { reply_markup: intentKeyboard() });
});

composer.on("message:text", async (ctx, next) => {
  if (flowExpired(ctx) && ctx.session.step !== "idle") {
    clearDraft(ctx);
    await ctx.reply("Your enquiry draft expired. Start again from the menu.");
    return;
  }
  const text = escapeText(ctx.message.text);
  if (ctx.session.step === "name") {
    if (!validName(text)) {
      await ctx.reply("Enter a name between 2 and 80 characters.");
      return;
    }
    ctx.session.leadDraft = { ...ctx.session.leadDraft, name: text };
    ctx.session.step = "phone";
    refreshExpiry(ctx);
    await ctx.reply("Share a phone number, including the country code.", {
      reply_markup: { force_reply: true, input_field_placeholder: "+1 555 123 4567" },
    });
    return;
  }
  if (ctx.session.step === "phone") {
    const phone = normalizePhone(text);
    if (!phone) {
      await ctx.reply("That phone number isn't valid. Send a number with at least seven digits.");
      return;
    }
    ctx.session.leadDraft = { ...ctx.session.leadDraft, phone };
    refreshExpiry(ctx);
    await ctx.reply("Choose the type of enquiry.", { reply_markup: intentKeyboard() });
    return;
  }
  if (ctx.session.step === "note") {
    if (text.length < 2 || text.length > 500) {
      await ctx.reply("Keep the note between 2 and 500 characters.");
      return;
    }
    ctx.session.leadDraft = { ...ctx.session.leadDraft, note: text };
    ctx.session.step = "confirm";
    refreshExpiry(ctx);
    if (draftComplete(ctx)) await ctx.reply(summary(ctx.session.leadDraft), { reply_markup: confirmationKeyboard() });
    return;
  }
  return next();
});

export default composer;
