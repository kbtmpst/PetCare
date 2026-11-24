import { useEffect } from "react";

// The green (success) or red (error) message shown at the top of a page after an action.
//   notice:    null (show nothing) or { type: "success" | "error", text: "..." }
//   onDismiss: called after 4 seconds so the page can set its notice back to null
export default function NoticeBanner({ notice, onDismiss }) {
  // Restart the 4-second timer only when a NEW notice appears.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!notice) return null;

  return (
    <p
      role="status"
      className={`mb-4 rounded-md border px-4 py-3 text-sm ${
        notice.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {notice.text}
    </p>
  );
}
