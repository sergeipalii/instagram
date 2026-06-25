// Client-side shape of an inbox item (decoupled from Drizzle's Date types, since
// SWR delivers JSON strings while the server component delivers Date objects).
export interface InboxItemView {
  event: {
    id: string;
    externalId: string;
    text: string | null;
    author: string | null;
    status: string;
    category: string | null;
    escalation: string | null;
    direction: string;
    modelUsed: string | null;
    createdAt: string | Date;
  };
  conversation: {
    id: string;
    kind: "dm" | "comment";
    participantUsername: string | null;
    participantId: string | null;
    permalink: string | null;
    mediaCaption: string | null;
  };
}
