import { listInbox } from "@/lib/inbox";
import { MODELS, defaultModelId } from "@/lib/models";
import { InboxClient } from "@/components/inbox/InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const initial = await listInbox({ statuses: ["triaged"] });
  return (
    <InboxClient
      initialItems={initial}
      models={MODELS}
      defaultModel={defaultModelId()}
    />
  );
}
