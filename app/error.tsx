"use client";

export default function Error({
  error: errorProp,
  reset,
}: {
  // biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js error boundary prop name
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h2 className="text-xl font-semibold mb-4">Something went wrong!</h2>
      {errorProp && <p className="text-red-600 mb-4 text-sm">{errorProp.message}</p>}
      <button
        type="button"
        onClick={() => reset()}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Try again
      </button>
    </div>
  );
}
