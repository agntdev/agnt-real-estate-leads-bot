/** Durable lead-record access backed by the Worker Durable Object store. */
export type LeadIntent = "Buy" | "Rent" | "Sell";
export type LeadStatus = "New" | "Done";

export interface Lead {
  id: string;
  submitter_telegram_id?: number;
  name: string;
  phone: string;
  intent: LeadIntent;
  note: string;
  status: LeadStatus;
  timestamp: string;
}

type LeadStoreStub = {
  fetch(input: string, init?: { method?: string; body?: string }): Promise<Response>;
};

type LeadStoreNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): LeadStoreStub;
};

export type LeadStoreEnv = { CHAT_DO?: LeadStoreNamespace };

function store(env: LeadStoreEnv | undefined): LeadStoreStub | undefined {
  const namespace = env?.CHAT_DO;
  return namespace?.get(namespace.idFromName("real-estate-leads"));
}

export async function saveLead(env: LeadStoreEnv | undefined, lead: Lead): Promise<boolean> {
  const target = store(env);
  if (!target) return false;
  const response = await target.fetch("https://do/leads", {
    method: "POST",
    body: JSON.stringify(lead),
  });
  return response.ok;
}

export async function listLeads(
  env: LeadStoreEnv | undefined,
  page: number,
  perPage = 10,
): Promise<{ leads: Lead[]; total: number } | undefined> {
  const target = store(env);
  if (!target) return undefined;
  const response = await target.fetch(
    `https://do/leads?page=${Math.max(0, Math.floor(page))}&per_page=${Math.max(1, Math.floor(perPage))}`,
  );
  if (!response.ok) return undefined;
  return (await response.json()) as { leads: Lead[]; total: number };
}

export async function getLead(
  env: LeadStoreEnv | undefined,
  id: string,
): Promise<Lead | undefined> {
  const target = store(env);
  if (!target) return undefined;
  const response = await target.fetch(`https://do/leads/${encodeURIComponent(id)}`);
  if (!response.ok) return undefined;
  return (await response.json()) as Lead;
}

export async function setLeadStatus(
  env: LeadStoreEnv | undefined,
  id: string,
  status: LeadStatus,
): Promise<Lead | undefined> {
  const target = store(env);
  if (!target) return undefined;
  const response = await target.fetch(`https://do/leads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!response.ok) return undefined;
  return (await response.json()) as Lead;
}
