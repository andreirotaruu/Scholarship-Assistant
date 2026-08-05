export function reviewSessionKey(tabId) {
  return `reviewSession:${tabId}`;
}

export async function saveReviewSession(storage, tab, application) {
  if (!tab?.id || !application) return;
  await storage.set({
    [reviewSessionKey(tab.id)]: {
      pageUrl: tab.url,
      application,
      savedAt: new Date().toISOString(),
    },
  });
}

export async function loadReviewSession(storage, tab) {
  if (!tab?.id) return null;
  const result = await storage.get(reviewSessionKey(tab.id));
  const session = result[reviewSessionKey(tab.id)];
  return session?.pageUrl === tab.url ? session.application : null;
}
