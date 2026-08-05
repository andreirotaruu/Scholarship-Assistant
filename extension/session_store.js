export const PROGRESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function reviewSessionKey(tabId) {
  return `reviewSession:${tabId}`;
}

export function progressKey(url) {
  return `applicationProgress:${new URL(url).origin}`;
}

export function safePageUrl(url) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function refreshApplicationSelectors(application, extractedFields) {
  if (!application || !Array.isArray(extractedFields)) return application;
  const current = new Map(extractedFields.map((field) => [field.field_id, field]));
  return {
    ...application,
    fields: application.fields.map((field) => {
      const match = current.get(field.field_id);
      return match ? { ...field, selector: match.selector } : field;
    }),
  };
}

function pageMetadata(tab, application, savedAt) {
  return {
    url: safePageUrl(tab.url),
    applicationId: application.application_id,
    savedAt: new Date(savedAt).toISOString(),
  };
}

export async function saveTemporaryReviewSession(sessionStorage, tab, application, now = Date.now()) {
  if (!tab?.id || !tab.url || !application) return;
  await sessionStorage.set({
    [reviewSessionKey(tab.id)]: {
      pageUrl: tab.url,
      application,
      savedAt: new Date(now).toISOString(),
    },
  });
}

export async function saveReviewSession(sessionStorage, persistentStorage, tab, application, now = Date.now()) {
  if (!tab?.id || !tab.url || !application) return;
  await saveTemporaryReviewSession(sessionStorage, tab, application, now);

  const key = progressKey(tab.url);
  const stored = await persistentStorage.get(key);
  const current = stored[key];
  const pages = Array.isArray(current?.pages)
    ? current.pages.filter((page) => page.url !== safePageUrl(tab.url) && Date.parse(page.savedAt) + PROGRESS_TTL_MS > now)
    : [];
  pages.push(pageMetadata(tab, application, now));
  await persistentStorage.set({
    [key]: {
      version: 1,
      origin: new URL(tab.url).origin,
      pages,
      expiresAt: new Date(now + PROGRESS_TTL_MS).toISOString(),
    },
  });
}

export async function loadReviewSession(sessionStorage, persistentStorage, tab, loadApplication, now = Date.now()) {
  if (!tab?.id || !tab.url) return { application: null, progress: null };
  const sessionResult = await sessionStorage.get(reviewSessionKey(tab.id));
  const session = sessionResult[reviewSessionKey(tab.id)];
  if (session?.pageUrl === tab.url && session.application) {
    return { application: session.application, progress: null };
  }

  const key = progressKey(tab.url);
  const persistentResult = await persistentStorage.get(key);
  const progress = persistentResult[key];
  if (!progress || Date.parse(progress.expiresAt) <= now) {
    if (progress) await persistentStorage.remove(key);
    return { application: null, progress: null };
  }

  const page = progress.pages?.find((item) => item.url === safePageUrl(tab.url));
  if (!page) return { application: null, progress };
  try {
    return { application: await loadApplication(page.applicationId), progress };
  } catch {
    return { application: null, progress };
  }
}

export async function clearReviewProgress(sessionStorage, persistentStorage, tab) {
  if (!tab?.id || !tab.url) return;
  const origin = new URL(tab.url).origin;
  const sessions = await sessionStorage.get(null);
  const sessionKeys = Object.entries(sessions)
    .filter(([key, value]) => {
      if (!key.startsWith("reviewSession:") || !value?.pageUrl) return false;
      try { return new URL(value.pageUrl).origin === origin; } catch { return false; }
    })
    .map(([key]) => key);
  await Promise.all([
    sessionStorage.remove(sessionKeys),
    persistentStorage.remove(progressKey(tab.url)),
  ]);
}
