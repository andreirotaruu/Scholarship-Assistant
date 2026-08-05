(() => {
  const ScholarSafe = globalThis.ScholarSafe || (globalThis.ScholarSafe = {});

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  }

  function notify(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function fillChoice(element, answer) {
    const normalized = String(answer).trim().toLowerCase();
    if (element.type === "checkbox") {
      element.checked = ["true", "yes", "1", "checked", "on"].includes(normalized);
      notify(element);
      return true;
    }
    if (element.type === "radio") {
      const root = element.closest("form, [role='form']") || document;
      const radios = root.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
      const match = Array.from(radios).find((radio) => {
        const label = radio.labels?.[0]?.innerText || radio.value;
        return label.trim().toLowerCase() === normalized;
      });
      if (!match) return false;
      match.checked = true;
      notify(match);
      return true;
    }
    return false;
  }

  function fillOne(field) {
    if (!field.approved || !field.answer || !field.selector) return { field_id: field.field_id, status: "skipped" };
    const element = document.querySelector(field.selector);
    if (!element) return { field_id: field.field_id, status: "not_found" };
    if (["submit", "button", "file", "hidden", "password"].includes(element.type)) {
      return { field_id: field.field_id, status: "manual_only" };
    }
    if (element instanceof HTMLSelectElement) {
      const normalized = String(field.answer).trim().toLowerCase();
      const option = Array.from(element.options).find((item) =>
        item.value.toLowerCase() === normalized || item.text.trim().toLowerCase() === normalized
      );
      if (!option) return { field_id: field.field_id, status: "option_not_found" };
      element.value = option.value;
      notify(element);
      return { field_id: field.field_id, status: "filled" };
    }
    if (element.type === "checkbox" || element.type === "radio") {
      return { field_id: field.field_id, status: fillChoice(element, field.answer) ? "filled" : "option_not_found" };
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      setNativeValue(element, String(field.answer));
      notify(element);
      return { field_id: field.field_id, status: "filled" };
    }
    return { field_id: field.field_id, status: "manual_only" };
  }

  ScholarSafe.fillApprovedFields = function fillApprovedFields(fields) {
    return fields.map(fillOne);
  };
})();
