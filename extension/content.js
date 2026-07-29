chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCHOLARSAFE_EXTRACT_FIELDS") {
    sendResponse({
      fields: globalThis.ScholarSafe.extractFields(),
      title: document.title,
      url: location.href
    });
    return;
  }
  if (message.type === "SCHOLARSAFE_FILL_APPROVED") {
    const results = globalThis.ScholarSafe.fillApprovedFields(message.fields || []);
    sendResponse({ results });
  }
});
