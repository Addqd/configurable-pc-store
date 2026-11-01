// Copies text to the clipboard. Falls back gracefully when the Clipboard API
// is unavailable (older browsers, non-secure contexts, tests). Resolves true
// when the write succeeds or a fallback succeeds; rejects on failure.
export async function copyToClipboard(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      // fall through to legacy fallback
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
