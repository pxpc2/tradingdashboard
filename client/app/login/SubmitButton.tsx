"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full hover:cursor-pointer justify-center items-center gap-2 rounded-sm bg-white px-3 py-2 text-sm font-medium text-black hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending && (
        <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
      )}
      {pending ? "" : "log in"}
    </button>
  );
}
