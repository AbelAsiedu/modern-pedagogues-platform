import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { KNOWLEDGE_BODY_MAX, listKnowledge } from "@/server/assistant/knowledge";
import { assistantStats, CHAT_LOG_RETENTION_DAYS, isAssistantEnabled, recentUnanswered } from "@/server/assistant/service";
import { assistantProviders, requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { createKnowledgeAction, deleteKnowledgeAction, testAssistantAction, toggleAssistantAction, updateKnowledgeAction } from "../actions";

export const metadata = { title: "Kaitlyn" };

function fields(e?: { title: string; body: string; isActive: boolean; sortOrder: number }): FieldSpec[] {
  return [
    { name: "title", label: "Topic", required: true, defaultValue: e?.title ?? "", hint: "For example: Group lessons, Holiday classes, Service areas." },
    { name: "body", label: "What Kaitlyn should know", type: "textarea", required: true, rows: 6, defaultValue: e?.body ?? "", hint: `Plain facts, up to ${KNOWLEDGE_BODY_MAX} characters. Kaitlyn treats this as authoritative, so keep it accurate. Do not paste private information.` },
    { name: "sortOrder", label: "Order (lowest first)", type: "number", defaultValue: e?.sortOrder ?? 0 },
    { name: "isActive", label: "Kaitlyn may use this", type: "checkbox", defaultValue: e?.isActive ?? true },
  ];
}

export default async function AssistantAdmin() {
  const s = await requirePermission("assistant.manage_knowledge", "/admin/assistant");
  const [entries, stats, unanswered, enabled] = await Promise.all([
    listKnowledge(db(), s.actor),
    assistantStats(db(), s.actor),
    recentUnanswered(db(), s.actor),
    isAssistantEnabled(db()),
  ]);
  const providers = assistantProviders().map((p) => p.name);
  const live = providers.length > 0 && enabled;
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Kaitlyn</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy/70">
        Kaitlyn answers from the public website text, the published tutor profiles and the notes below. She cannot see accounts, payments, bookings or private tutor details.
      </p>

      <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Status</h2>
        <p className="mt-2">
          <span className={`rounded-full px-3 py-1 text-sm ${live ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>
            {live ? "Live on the website" : providers.length === 0 ? "Off: no AI provider key is configured" : "Switched off"}
          </span>
        </p>
        <p className="mt-3 text-sm">
          Providers configured: {providers.length ? providers.join(", ") : "none"}. Keys are set on the server (see DEPLOYMENT.md) and are never shown here.
        </p>
        {providers.length === 0 ? (
          <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm leading-6">
            <p className="font-semibold">To switch Kaitlyn on you need a free AI key (about 5 minutes):</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Open <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> and sign in with a Google account.</li>
              <li>Choose Create API key, then copy the key.</li>
              <li>In the Heroku dashboard open your app, then Settings, then Reveal Config Vars, and add one named <strong>GEMINI_API_KEY</strong> with the key as its value. Never paste the key into chat or email.</li>
              <li>Come back here, reload, and press Test the connection.</li>
            </ol>
          </div>
        ) : (
          <div className="mt-4">
            <ActionForm action={testAssistantAction} fields={[]} submitLabel="Test the connection" tone="quiet" />
          </div>
        )}
        <div className="mt-4">
          <ActionForm
            action={toggleAssistantAction}
            hidden={{ enabled: String(!enabled) }}
            fields={[]}
            submitLabel={enabled ? "Switch Kaitlyn off" : "Switch Kaitlyn on"}
            tone="quiet"
          />
        </div>
        <p className="mt-4 text-sm text-navy/70">
          Last {stats.days} days: {stats.total} chats, {stats.answered} answered, {stats.unanswered} unanswered ({Math.round(stats.unansweredRate * 100)}%), {stats.blocked} declined. Chat text is kept {CHAT_LOG_RETENTION_DAYS} days.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Add knowledge</h2>
        <div className="mt-4 max-w-2xl">
          <ActionForm action={createKnowledgeAction} fields={fields()} submitLabel="Add" />
        </div>
      </section>

      <ul className="mt-6 space-y-4">
        {entries.map((e) => (
          <li key={e.id} className="rounded-2xl border border-navy/10 bg-white/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">
                {e.title}{" "}
                <span className={`ml-2 rounded-full px-3 py-1 text-xs font-normal ${e.isActive ? "bg-green-100 text-green-900" : "bg-navy/10"}`}>{e.isActive ? "In use" : "Not used"}</span>
              </p>
              <ActionForm className="inline" action={deleteKnowledgeAction} hidden={{ entryId: e.id }} fields={[]} submitLabel="Delete" tone="danger" />
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold underline decoration-gold underline-offset-4">Edit</summary>
              <div className="mt-4 max-w-2xl">
                <ActionForm action={updateKnowledgeAction} hidden={{ entryId: e.id }} fields={fields(e)} submitLabel="Save changes" />
              </div>
            </details>
          </li>
        ))}
        {entries.length === 0 ? <li className="text-navy/70">No notes yet. Kaitlyn is using the website text and tutor profiles only.</li> : null}
      </ul>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Questions Kaitlyn could not answer</h2>
        <p className="mt-1 text-sm text-navy/70">A good guide to what to add above. These are visitors&apos; own words, so treat them as private.</p>
        <ul className="mt-3 divide-y divide-navy/10 rounded-2xl border border-navy/10 bg-white/70">
          {unanswered.map((u) => (
            <li key={u.id} className="p-3 text-sm">
              <span className="text-navy/60">{u.createdAt.toLocaleString("en-GB")}:</span> {u.message}
            </li>
          ))}
          {unanswered.length === 0 ? <li className="p-3 text-sm text-navy/70">None yet.</li> : null}
        </ul>
      </section>
    </>
  );
}
