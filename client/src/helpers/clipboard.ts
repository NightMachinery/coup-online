const copyViaClipboardApi = async (text: string): Promise<boolean> => {
  if (!navigator.clipboard?.writeText) {
    return false
  }

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const copyViaExecCommand = (text: string): boolean => {
  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.top = '-9999px'
  textArea.style.left = '-9999px'

  document.body.appendChild(textArea)

  const selection = document.getSelection()
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  textArea.focus()
  textArea.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  document.body.removeChild(textArea)

  if (selection) {
    selection.removeAllRanges()
    if (previousRange) {
      selection.addRange(previousRange)
    }
  }

  return copied
}

export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (await copyViaClipboardApi(text)) {
    return true
  }

  return copyViaExecCommand(text)
}
