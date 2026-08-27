export default function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{message}</p>
}
