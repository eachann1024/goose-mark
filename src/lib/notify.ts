type MiniUTools = { showNotification?: (body: string) => void }

export const notify = (msg: string) => {
  const ut = (window as unknown as { utools?: MiniUTools }).utools
  try {
    if (ut?.showNotification) ut.showNotification(msg)
    else console.info(msg)
  } catch {
    console.info(msg)
  }
}

