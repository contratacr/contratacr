"use client";

import { useEffect } from "react";

// Blocks emoji in EVERY <input>/<textarea> across the app via document-level
// listeners — covers keypress (beforeinput) and paste without having to touch
// each field individually.
const EMOJI = /(\p{Extended_Pictographic}|\p{Regional_Indicator}|️|‍)/u;
const EMOJI_G = /(\p{Extended_Pictographic}|\p{Regional_Indicator}|️|‍)/gu;

function isTextField(t: EventTarget | null): t is HTMLInputElement | HTMLTextAreaElement {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}

export function EmojiBlocker() {
  useEffect(() => {
    function onBeforeInput(e: Event) {
      const ie = e as InputEvent;
      if (!isTextField(ie.target)) return;
      if (ie.data && EMOJI.test(ie.data)) ie.preventDefault();
    }

    function onPaste(e: ClipboardEvent) {
      if (!isTextField(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!EMOJI.test(text)) return;
      e.preventDefault();
      const clean = text.replace(EMOJI_G, "");
      // insertText triggers a real input event so React controlled state updates.
      try {
        document.execCommand("insertText", false, clean);
      } catch {
        /* no-op */
      }
    }

    document.addEventListener("beforeinput", onBeforeInput, true);
    document.addEventListener("paste", onPaste, true);
    return () => {
      document.removeEventListener("beforeinput", onBeforeInput, true);
      document.removeEventListener("paste", onPaste, true);
    };
  }, []);

  return null;
}
