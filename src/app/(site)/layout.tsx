import { KaitlynChat } from "@/components/site/KaitlynChat";
import { PageShell } from "@/components/site/Chrome";
import { isAssistantAvailable } from "@/server/assistant/service";
import { assistantProviders, getSiteText } from "@/server/context";
import { db } from "@/server/db";

// Page text is admin-editable and read from the database, so these pages must not be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Kaitlyn appears only when a provider key is configured and an administrator has not switched her off.
  const kaitlyn = await isAssistantAvailable(db(), assistantProviders()).catch(() => false);
  const t = kaitlyn ? await getSiteText() : null;
  return (
    <PageShell>
      {children}
      {kaitlyn && t ? (
        <KaitlynChat
          greeting={t.text("assistant.greeting")}
          disclaimer={t.text("assistant.disclaimer")}
          whatsappHref={t.whatsapp(`Hello ${t.biz.name}, I have a question.`)}
          avatar={t.image("assistant.avatar") || undefined}
          avatarAlt={t.imageAlt("assistant.avatar")}
        />
      ) : null}
    </PageShell>
  );
}
